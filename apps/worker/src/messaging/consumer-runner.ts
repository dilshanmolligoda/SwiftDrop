import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConsumeMessage } from 'amqplib';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker.config.js';
import { ProcessedEventsStore } from '../idempotency/processed-events.store.js';
import {
  attemptOf,
  planRetry,
  processMessage,
  PROCESSING_ATTEMPT_HEADER,
  type Outcome,
} from './message-processor.js';
import {
  PARCEL_EVENT_CONSUMERS,
  type ParcelEventConsumer,
} from './parcel-event-consumer.js';
import { RabbitMqConnection } from './rabbitmq.connection.js';

/**
 * Starts every registered consumer on its own channel and applies each
 * message's outcome. Competing consumers: run several workers and RabbitMQ
 * spreads messages between them.
 */
@Injectable()
export class ConsumerRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ConsumerRunner.name);
  private readonly channels: ChannelWrapper[] = [];
  private readonly inFlight = new Set<Promise<void>>();
  /** Pending retry delays; released at once on shutdown. */
  private readonly retryWaits = new Map<NodeJS.Timeout, () => void>();
  private stopping = false;

  constructor(
    private readonly connection: RabbitMqConnection,
    private readonly store: ProcessedEventsStore,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
    @Inject(PARCEL_EVENT_CONSUMERS)
    private readonly consumers: ParcelEventConsumer[],
  ) {}

  onApplicationBootstrap(): void {
    for (const consumer of this.consumers) {
      const channel = this.connection.createChannel(
        `consumer:${consumer.name}`,
      );
      this.channels.push(channel);
      // Resolves once connected; re-subscribes on its own after reconnects.
      void channel
        .consume(
          consumer.queue,
          (msg) => this.onMessage(channel, consumer, msg),
          {
            prefetch: this.config.prefetch,
            noAck: false,
          },
        )
        .then(() =>
          this.logger.log(`${consumer.name} consuming ${consumer.queue}`),
        )
        .catch((error: unknown) =>
          this.logger.error(
            `${consumer.name} could not start consuming: ${String(error)}`,
          ),
        );
    }
  }

  /** Stop taking messages, finish the ones in progress, then close channels. */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled(this.channels.map((c) => c.cancelAll()));
    // Messages waiting to be retried go back to the queue right away.
    for (const [timer, release] of this.retryWaits) {
      clearTimeout(timer);
      release();
    }
    await Promise.allSettled([...this.inFlight]);
    await Promise.allSettled(this.channels.map((c) => c.close()));
  }

  private onMessage(
    channel: ChannelWrapper,
    consumer: ParcelEventConsumer,
    msg: ConsumeMessage,
  ): void {
    const work = this.process(channel, consumer, msg).finally(() =>
      this.inFlight.delete(work),
    );
    this.inFlight.add(work);
  }

  private async process(
    channel: ChannelWrapper,
    consumer: ParcelEventConsumer,
    msg: ConsumeMessage,
  ): Promise<void> {
    const outcome = await processMessage(
      {
        content: msg.content,
        delivery: {
          redelivered: msg.fields.redelivered,
          headers: msg.properties.headers ?? {},
        },
      },
      consumer,
      this.store,
    );
    const rawId: unknown = msg.properties.messageId;
    const id = typeof rawId === 'string' ? rawId : 'unknown';
    this.log(consumer, id, outcome);

    switch (outcome.action) {
      case 'ack':
        channel.ack(msg);
        return;
      case 'dead-letter':
        channel.nack(msg, false, false); // → queue's dead-letter exchange
        return;
      case 'retry':
        await this.retry(channel, consumer, msg, id);
        return;
    }
  }

  /**
   * Re-publishes a copy with the next attempt number, then acks the original
   * (a crash in between only causes a duplicate, which is deduped). After
   * MAX_PROCESSING_ATTEMPTS the message is dead-lettered instead.
   */
  private async retry(
    channel: ChannelWrapper,
    consumer: ParcelEventConsumer,
    msg: ConsumeMessage,
    id: string,
  ): Promise<void> {
    const headers = msg.properties.headers ?? {};
    const plan = planRetry(attemptOf(headers), this.config.retryDelayMs);

    if (plan.action === 'dead-letter') {
      this.logger.error(
        `${consumer.name} event ${id}: dead-lettered after ${plan.attempts} attempts`,
      );
      channel.nack(msg, false, false);
      return;
    }

    if (this.stopping) {
      // Shutting down: hand it straight back; it keeps its attempt number.
      channel.nack(msg, false, true);
      return;
    }

    await this.delay(plan.delayMs);
    try {
      await channel.sendToQueue(consumer.queue, msg.content, {
        persistent: true,
        contentType: msg.properties.contentType as string | undefined,
        messageId: msg.properties.messageId as string | undefined,
        type: msg.properties.type as string | undefined,
        timestamp: msg.properties.timestamp as number | undefined,
        appId: msg.properties.appId as string | undefined,
        headers: { ...headers, [PROCESSING_ATTEMPT_HEADER]: plan.nextAttempt },
      });
      channel.ack(msg);
    } catch (error: unknown) {
      this.logger.warn(
        `${consumer.name} event ${id}: could not re-publish for retry (${String(error)}); requeueing`,
      );
      channel.nack(msg, false, true);
    }
  }

  private log(consumer: ParcelEventConsumer, id: string, outcome: Outcome) {
    const prefix = `${consumer.name} event ${id}`;
    if (outcome.action === 'ack') {
      this.logger.debug(`${prefix}: ${outcome.detail}`);
    } else if (outcome.action === 'retry') {
      this.logger.warn(`${prefix}: will retry (${outcome.reason})`);
    } else {
      this.logger.error(`${prefix}: dead-lettered (${outcome.reason})`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const release = () => {
        this.retryWaits.delete(timer);
        resolve();
      };
      const timer = setTimeout(release, ms);
      this.retryWaits.set(timer, release);
    });
  }
}
