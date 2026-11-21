import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { parseParcelEvent } from '@swiftdrop/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MESSAGING_CONFIG, type MessagingConfig } from './messaging.config.js';
import { RabbitMqPublisher } from './rabbitmq.publisher.js';

interface OutboxRow {
  id: string;
  sequence: bigint;
  routingKey: string;
  payload: unknown;
  attempts: number;
}

export interface BatchResult {
  /** True when another API instance holds the relay lock, or RabbitMQ is down. */
  readonly skipped: boolean;
  readonly published: number;
  readonly failed: number;
}

/** Arbitrary constant: the Postgres advisory lock that lets only one relay run at a time. */
const RELAY_LOCK_KEY = 7_406_210_001;
const MAX_ROW_BACKOFF_MS = 5 * 60_000;
/** A row that can never be published (invalid payload) is retried rarely. */
const INVALID_ROW_RETRY_MS = 60 * 60_000;
const MAX_ERROR_LENGTH = 1000;

/**
 * Publishes outbox rows to RabbitMQ (transactional outbox, ARCHITECTURE.md §7.1).
 *
 * - Polls every OUTBOX_POLL_INTERVAL_MS; runs again at once after a full batch.
 * - Only one API instance publishes at a time (advisory lock), so events leave
 *   in `sequence` order.
 * - A row is marked published only after the broker confirms it. A crash
 *   between confirm and commit republishes it: consumers dedupe on eventId.
 * - On a publish failure the batch stops (keeps order) and that row backs off
 *   exponentially; an invalid row backs off for an hour and does not block others.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: RabbitMqPublisher,
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      this.logger.warn(
        'Outbox relay disabled (RABBITMQ_URL not set or OUTBOX_RELAY_ENABLED=false). ' +
          'Events are kept in outbox_events and published once it is enabled.',
      );
      return;
    }
    this.publisher.start();
    this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
    await this.publisher.close();
  }

  /** One relay pass. Public for tests. */
  async publishBatch(): Promise<BatchResult> {
    if (!this.publisher.isConnected()) {
      return { skipped: true, published: 0, failed: 0 };
    }

    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${RELAY_LOCK_KEY}::bigint) AS locked`;
        if (!lock?.locked) {
          return { skipped: true, published: 0, failed: 0 };
        }

        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT "id", "sequence", "routingKey", "payload", "attempts"
            FROM "outbox_events"
           WHERE "publishedAt" IS NULL AND "nextAttemptAt" <= now()
           ORDER BY "sequence"
           LIMIT ${this.config.batchSize}
             FOR UPDATE SKIP LOCKED`;

        const publishedIds: string[] = [];
        let failed = 0;

        for (const row of rows) {
          const event = parseParcelEvent(
            isObject(row.payload)
              ? {
                  ...row.payload,
                  eventId: row.id,
                  sequence: Number(row.sequence),
                }
              : row.payload,
          );
          if (!event.ok) {
            failed++;
            this.logger.error(
              `Outbox event ${row.id} has an invalid payload: ${event.error}`,
            );
            await this.markFailed(
              tx,
              row,
              `Invalid payload: ${event.error}`,
              INVALID_ROW_RETRY_MS,
            );
            continue;
          }

          try {
            await this.publisher.publish(
              row.routingKey,
              Buffer.from(JSON.stringify(event.value)),
              {
                messageId: event.value.eventId,
                type: event.value.eventType,
                occurredAt: new Date(event.value.occurredAt),
              },
            );
            publishedIds.push(row.id);
          } catch (error: unknown) {
            failed++;
            const message = errorMessage(error);
            this.logger.warn(
              `Publishing outbox event ${row.id} failed: ${message}`,
            );
            await this.markFailed(tx, row, message, rowBackoffMs(row.attempts));
            break; // keep order: later events wait for this one
          }
        }

        if (publishedIds.length > 0) {
          await tx.outboxEvent.updateMany({
            where: { id: { in: publishedIds } },
            data: { publishedAt: new Date() },
          });
        }
        return { skipped: false, published: publishedIds.length, failed };
      },
      { maxWait: 5_000, timeout: 60_000 },
    );
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.inFlight = this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    let next = this.config.pollIntervalMs;
    try {
      const result = await this.publishBatch();
      if (result.published > 0) {
        this.logger.debug(`Published ${result.published} outbox event(s)`);
      }
      if (
        !result.skipped &&
        result.failed === 0 &&
        result.published >= this.config.batchSize
      ) {
        next = 0; // more waiting — continue immediately
      }
    } catch (error: unknown) {
      if (!this.stopped) {
        this.logger.error(`Outbox relay pass failed: ${errorMessage(error)}`);
      }
    } finally {
      this.schedule(next);
    }
  }

  private async markFailed(
    tx: Prisma.TransactionClient,
    row: OutboxRow,
    message: string,
    delayMs: number,
  ): Promise<void> {
    await tx.outboxEvent.update({
      where: { id: row.id },
      data: {
        attempts: { increment: 1 },
        lastError: message.slice(0, MAX_ERROR_LENGTH),
        nextAttemptAt: new Date(Date.now() + delayMs),
      },
    });
  }
}

/** 1s, 2s, 4s … capped at 5 minutes. */
export function rowBackoffMs(previousAttempts: number): number {
  return Math.min(1000 * 2 ** previousAttempts, MAX_ROW_BACKOFF_MS);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
