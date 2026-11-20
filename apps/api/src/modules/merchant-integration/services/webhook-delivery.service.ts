import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookDeliveryStatus } from '../../../generated/prisma/enums.js';
import { decideNextWebhookStep } from '../domain/webhook-retry-policy.js';
import { decryptWebhookSecret } from '../domain/webhook-secret.js';
import {
  signWebhookPayload,
  WEBHOOK_HEADERS,
} from '../domain/webhook-signature.js';
import { WebhooksRepository } from '../repositories/webhooks.repository.js';
import {
  WebhookHttpClient,
  type WebhookHttpResult,
} from './webhook-http.client.js';
import { WebhookSettings } from './webhook-settings.js';

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 20;

/**
 * Sends queued webhook deliveries and retries failures with backoff
 * (see domain/webhook-retry-policy.ts). Deliveries live in the database, so a
 * pending retry survives an API restart.
 *
 * Runs inside the API until the RabbitMQ worker exists; it can then move to
 * the worker unchanged, because it only depends on the database.
 */
@Injectable()
export class WebhookDeliveryService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WebhookDeliveryService.name);
  private timer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private readonly webhooksRepository: WebhooksRepository,
    private readonly httpClient: WebhookHttpClient,
    private readonly settings: WebhookSettings,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Tests drive deliveries explicitly instead of on a timer.
    if (this.configService.get<string>('NODE_ENV') === 'test') return;

    const released = await this.webhooksRepository.releaseStuckClaims(
      new Date(),
    );
    if (released > 0) {
      this.logger.warn(
        `Re-queued ${released} webhook deliveries interrupted by a restart`,
      );
    }
    this.timer = setInterval(() => void this.processDue(), POLL_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends every delivery whose next attempt is due. Returns how many were attempted. */
  async processDue(now = new Date()): Promise<number> {
    if (this.polling) return 0;
    this.polling = true;
    try {
      const ids = await this.webhooksRepository.findDueDeliveryIds(
        now,
        BATCH_SIZE,
      );
      let attempted = 0;
      for (const id of ids) {
        if (await this.attempt(id, now)) attempted++;
      }
      return attempted;
    } catch (error) {
      this.logger.error(`Webhook polling failed: ${(error as Error).message}`);
      return 0;
    } finally {
      this.polling = false;
    }
  }

  /** Makes one HTTP attempt for a due delivery. Returns false if it was not due or already taken. */
  async attempt(deliveryId: string, now = new Date()): Promise<boolean> {
    const delivery = await this.webhooksRepository.claimDelivery(
      deliveryId,
      now,
    );
    if (!delivery) return false;

    const attemptNumber = delivery.attemptCount + 1;
    const body = JSON.stringify(delivery.payload);
    const timestamp = String(Math.floor(Date.now() / 1000));

    let result: WebhookHttpResult;
    try {
      const secret = decryptWebhookSecret(
        delivery.endpoint.encryptedSecret,
        this.settings.encryptionKey(),
        delivery.endpoint.merchantProfileId,
      );
      result = await this.httpClient.post(
        delivery.endpoint.url,
        {
          [WEBHOOK_HEADERS.eventId]: delivery.eventId,
          [WEBHOOK_HEADERS.timestamp]: timestamp,
          [WEBHOOK_HEADERS.signature]: signWebhookPayload(
            secret,
            timestamp,
            body,
          ),
        },
        body,
        this.settings.timeoutMs,
      );
    } catch {
      // Secret could not be decrypted (key changed or missing): retry later,
      // the merchant can rotate the secret meanwhile.
      result = {
        statusCode: null,
        error: 'Could not sign the webhook',
        durationMs: 0,
      };
    }

    const step = decideNextWebhookStep(
      result.statusCode,
      attemptNumber,
      this.settings.retry,
    );
    const status =
      step.action === 'DONE'
        ? WebhookDeliveryStatus.DELIVERED
        : step.action === 'RETRY'
          ? WebhookDeliveryStatus.PENDING
          : WebhookDeliveryStatus.FAILED;

    await this.webhooksRepository.recordAttempt(delivery.id, {
      attemptNumber,
      statusCode: result.statusCode,
      error: result.error,
      durationMs: result.durationMs,
      status,
      nextAttemptAt:
        step.action === 'RETRY' ? new Date(Date.now() + step.delayMs) : null,
    });

    this.logger.log(
      `Webhook ${delivery.eventType} ${delivery.eventId} attempt ${attemptNumber}: ` +
        `${result.statusCode ?? result.error} → ${status}` +
        (step.action === 'RETRY'
          ? ` (retry in ${Math.round(step.delayMs / 1000)}s)`
          : ''),
    );
    return true;
  }
}
