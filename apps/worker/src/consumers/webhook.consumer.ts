import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  checkWebhookUrl,
  ConsumerName,
  decideNextWebhookStep,
  getRetryDelayMs,
  MessageHeader,
  Queue,
  toMerchantWebhookPayload,
  WEBHOOK_HEADERS,
  webhookRetryQueue,
  type ParcelEventV1,
  type WebhookNextStep,
} from '@swiftdrop/contracts';
import {
  decryptWebhookSecret,
  signWebhookPayload,
} from '@swiftdrop/contracts/node';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker.config.js';
import type { WebhookDeliveryStatus } from '../generated/prisma/enums.js';
import { PROCESSING_ATTEMPT_HEADER } from '../messaging/message-processor.js';
import {
  PermanentFailure,
  type DeliveryInfo,
  type HandleResult,
  type ParcelEventConsumer,
} from '../messaging/parcel-event-consumer.js';
import { WorkerPublisher } from '../messaging/worker-publisher.js';
import {
  WebhookDeliveryRepository,
  type ActiveEndpoint,
} from '../webhooks/webhook-delivery.repository.js';
import {
  postWebhook,
  type WebhookHttpResult,
} from '../webhooks/webhook-http-client.js';

/**
 * Sends signed webhooks to merchants (ARCHITECTURE.md §7.4).
 *
 * One message = one delivery attempt. The attempt number travels in the
 * `x-swiftdrop-attempt` header:
 * - 2xx → DELIVERED, done
 * - timeout / network error / 408 / 429 / 5xx → RETRY_SCHEDULED; the message
 *   is parked in `webhooks.retry.{delay}ms` and comes back for attempt + 1
 * - other 4xx, blocked private address, invalid URL → FAILED, done
 * - retryable failure on the last attempt → DEAD_LETTERED + copy to the DLQ
 *
 * Every attempt is a row in webhook_deliveries (unique per endpoint, event and
 * attempt), which also makes a redelivered message harmless.
 */
@Injectable()
export class WebhookConsumer
  implements ParcelEventConsumer, OnApplicationBootstrap
{
  readonly queue = Queue.WEBHOOKS;
  readonly name = ConsumerName.WEBHOOKS;
  private readonly logger = new Logger(WebhookConsumer.name);

  constructor(
    private readonly repository: WebhookDeliveryRepository,
    private readonly publisher: WorkerPublisher,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.webhooks.encryptionKey) {
      this.logger.warn(
        'WEBHOOK_SECRET_ENCRYPTION_KEY is missing or not 32 bytes: merchant webhooks ' +
          'will be dead-lettered until it is set.',
      );
    }
  }

  async handle(
    event: ParcelEventV1,
    delivery: DeliveryInfo,
  ): Promise<HandleResult> {
    if (event.merchantId === null) {
      return; // customer parcel: nobody to call
    }
    const endpoint = await this.repository.findActiveEndpoint(event.merchantId);
    if (!endpoint) {
      return; // merchant has no webhook configured
    }

    const attempt = attemptNumber(delivery.headers);
    const previous = await this.repository.findAttempt(
      endpoint.id,
      event.eventId,
      attempt,
    );
    if (previous) {
      // Redelivered after a crash: this attempt already ran. Finish its follow-up.
      if (previous.status === 'RETRY_SCHEDULED') {
        await this.scheduleRetry(event, attempt);
        return 'deferred';
      }
      return;
    }

    const { webhooks } = this.config;
    if (!webhooks.encryptionKey) {
      throw new PermanentFailure(
        'WEBHOOK_SECRET_ENCRYPTION_KEY is not configured',
      );
    }

    const base = {
      endpointId: endpoint.id,
      eventId: event.eventId,
      eventType: event.eventType,
      trackingNumber: event.trackingNumber,
      attempt,
      requestUrl: endpoint.url,
    };

    const target = this.resolveTarget(endpoint);
    if (!target.ok) {
      await this.repository.recordAttempt({
        ...base,
        status: 'FAILED',
        responseStatus: null,
        durationMs: null,
        errorMessage: target.error,
        nextAttemptAt: null,
      });
      this.logger.warn(`Webhook ${event.eventId} not sent: ${target.error}`);
      return;
    }

    let secret: string;
    try {
      secret = decryptWebhookSecret(
        endpoint.secretEncrypted,
        webhooks.encryptionKey,
        endpoint.merchantUserId,
      );
    } catch {
      // Wrong key or tampered row: retrying can't fix it.
      throw new PermanentFailure(
        `cannot decrypt the signing secret of webhook endpoint ${endpoint.id}`,
      );
    }

    const body = JSON.stringify(
      toMerchantWebhookPayload(
        event,
        await this.repository.merchantOrderRef(
          event.parcelId,
          event.merchantId,
        ),
      ),
    );
    const timestamp = String(Math.floor(Date.now() / 1000));
    const result = await postWebhook({
      url: target.url,
      body,
      timeoutMs: webhooks.timeoutMs,
      allowPrivate: target.allowPrivate,
      headers: {
        [WEBHOOK_HEADERS.eventId]: event.eventId,
        [WEBHOOK_HEADERS.eventType]: event.eventType,
        [WEBHOOK_HEADERS.timestamp]: timestamp,
        [WEBHOOK_HEADERS.signature]: signWebhookPayload(
          secret,
          timestamp,
          body,
        ),
        [WEBHOOK_HEADERS.attempt]: String(attempt),
      },
    });

    const step = nextStep(result, attempt, webhooks);
    const nextAttemptAt =
      step.action === 'RETRY' ? new Date(Date.now() + step.delayMs) : null;

    await this.repository.recordAttempt({
      ...base,
      status: statusFor(step),
      responseStatus: result.kind === 'response' ? result.statusCode : null,
      durationMs: result.durationMs,
      errorMessage: errorFor(result),
      nextAttemptAt,
    });
    this.logOutcome(event, endpoint, attempt, result, step);

    if (step.action === 'RETRY') {
      await this.scheduleRetry(event, attempt);
      return 'deferred';
    }
    if (
      step.action === 'DEAD_LETTER' &&
      step.reason === 'MAX_ATTEMPTS_REACHED'
    ) {
      await this.publisher.sendToQueue(
        Queue.WEBHOOKS_DEAD_LETTER,
        eventBody(event),
        {
          messageId: event.eventId,
          type: event.eventType,
          headers: {
            [MessageHeader.ATTEMPT]: attempt,
            [MessageHeader.DEAD_LETTER_REASON]: 'webhook max attempts reached',
          },
        },
      );
    }
    return;
  }

  /**
   * Parks the event in the delay queue for the next attempt. The queue's TTL
   * is the delay; the queues are declared by WorkerPublisher at startup.
   */
  private async scheduleRetry(
    event: ParcelEventV1,
    failedAttempt: number,
  ): Promise<void> {
    const delayMs = getRetryDelayMs(failedAttempt, this.config.webhooks);
    if (delayMs === null) {
      throw new Error(`no retry delay for webhook attempt ${failedAttempt}`);
    }
    await this.publisher.sendToQueue(
      webhookRetryQueue(delayMs),
      eventBody(event),
      {
        messageId: event.eventId,
        type: event.eventType,
        headers: {
          [MessageHeader.ATTEMPT]: failedAttempt + 1,
          // a new webhook attempt starts its own processing-retry count
          [PROCESSING_ATTEMPT_HEADER]: 1,
        },
      },
    );
  }

  private resolveTarget(
    endpoint: ActiveEndpoint,
  ):
    | { ok: true; url: URL; allowPrivate: boolean }
    | { ok: false; error: string } {
    const { webhooks } = this.config;
    const host = hostOf(endpoint.url);
    const allowlisted =
      host !== null && webhooks.privateHostAllowlist.has(host);
    const check = checkWebhookUrl(endpoint.url, {
      requireHttps: webhooks.requireHttps && !allowlisted,
    });
    if (!check.ok) return check;
    return {
      ok: true,
      url: check.url,
      allowPrivate: webhooks.allowPrivateTargets || allowlisted,
    };
  }

  private logOutcome(
    event: ParcelEventV1,
    endpoint: ActiveEndpoint,
    attempt: number,
    result: WebhookHttpResult,
    step: WebhookNextStep,
  ): void {
    const what =
      result.kind === 'response' ? `HTTP ${result.statusCode}` : result.error;
    const message = `Webhook ${event.eventId} attempt ${attempt} to ${hostOf(endpoint.url) ?? 'invalid host'}: ${what} → ${statusFor(step)}`;
    if (step.action === 'DONE') this.logger.log(message);
    else this.logger.warn(message);
  }
}

/** 1-based webhook attempt carried by the message (1 when absent). */
export function attemptNumber(
  headers: Readonly<Record<string, unknown>>,
): number {
  const value = headers[MessageHeader.ATTEMPT];
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : 1;
}

/** A blocked address is never retried, whatever the attempt. */
export function nextStep(
  result: WebhookHttpResult,
  attempt: number,
  config: { maxAttempts: number; backoffBaseMs: number },
): WebhookNextStep {
  if (result.kind === 'blocked') {
    return { action: 'DEAD_LETTER', reason: 'NON_RETRYABLE_STATUS' };
  }
  return decideNextWebhookStep(
    result.kind === 'response' ? result.statusCode : null,
    attempt,
    config,
  );
}

export function statusFor(step: WebhookNextStep): WebhookDeliveryStatus {
  switch (step.action) {
    case 'DONE':
      return 'DELIVERED';
    case 'RETRY':
      return 'RETRY_SCHEDULED';
    case 'DEAD_LETTER':
      return step.reason === 'MAX_ATTEMPTS_REACHED'
        ? 'DEAD_LETTERED'
        : 'FAILED';
  }
}

function errorFor(result: WebhookHttpResult): string | null {
  if (result.kind !== 'response') return result.error;
  return result.statusCode >= 200 && result.statusCode < 300
    ? null
    : `HTTP ${result.statusCode}`;
}

function eventBody(event: ParcelEventV1): Buffer {
  return Buffer.from(JSON.stringify(event));
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
