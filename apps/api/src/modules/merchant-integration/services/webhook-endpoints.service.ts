import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  WebhookDeliveryAttempt,
  WebhookEndpoint,
} from '../../../generated/prisma/client.js';
import { WebhookDeliveryStatus } from '../../../generated/prisma/enums.js';
import {
  encryptWebhookSecret,
  generateWebhookSecret,
} from '../domain/webhook-secret.js';
import { checkWebhookUrl } from '../domain/webhook-url.js';
import { MerchantProfilesRepository } from '../repositories/merchant-profiles.repository.js';
import {
  WebhooksRepository,
  type DeliveryWithAttempts,
} from '../repositories/webhooks.repository.js';
import { WebhookDeliveryService } from './webhook-delivery.service.js';
import { WebhookSettings } from './webhook-settings.js';

export const TEST_EVENT_TYPE = 'webhook.test';
const MAX_LISTED_DELIVERIES = 50;

export interface WebhookEndpointView {
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEndpointResult {
  endpoint: WebhookEndpointView;
  /** Only present when a new secret was just created; never retrievable again. */
  signingSecret?: string;
}

export interface WebhookDeliveryView {
  id: string;
  eventId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: Date | null;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
  attempts: Pick<
    WebhookDeliveryAttempt,
    'attemptNumber' | 'statusCode' | 'error' | 'durationMs' | 'attemptedAt'
  >[];
}

@Injectable()
export class WebhookEndpointsService {
  private readonly logger = new Logger(WebhookEndpointsService.name);

  constructor(
    private readonly webhooksRepository: WebhooksRepository,
    private readonly profilesRepository: MerchantProfilesRepository,
    private readonly deliveryService: WebhookDeliveryService,
    private readonly settings: WebhookSettings,
  ) {}

  async get(userId: string): Promise<WebhookEndpointView | null> {
    const endpoint = await this.findEndpoint(userId);
    return endpoint ? toEndpointView(endpoint) : null;
  }

  /** Registers the URL, or changes it. A signing secret is created (and returned) only the first time. */
  async save(userId: string, rawUrl: string): Promise<WebhookEndpointResult> {
    const merchantProfileId = await this.requireMerchantProfileId(userId);
    const url = this.validateUrl(rawUrl);
    const existing =
      await this.webhooksRepository.findEndpoint(merchantProfileId);

    if (existing) {
      const updated = await this.webhooksRepository.updateEndpoint(
        existing.id,
        { url },
      );
      return { endpoint: toEndpointView(updated) };
    }

    const signingSecret = generateWebhookSecret();
    const created = await this.webhooksRepository.createEndpoint({
      merchantProfileId,
      url,
      encryptedSecret: this.encrypt(signingSecret, merchantProfileId),
    });
    this.logger.log(
      `Webhook endpoint registered for merchant ${merchantProfileId}`,
    );
    return { endpoint: toEndpointView(created), signingSecret };
  }

  /** Replaces the signing secret; the old one stops working immediately. */
  async rotateSecret(userId: string): Promise<WebhookEndpointResult> {
    const endpoint = await this.requireEndpoint(userId);
    const signingSecret = generateWebhookSecret();
    const updated = await this.webhooksRepository.updateEndpoint(endpoint.id, {
      encryptedSecret: this.encrypt(signingSecret, endpoint.merchantProfileId),
    });
    this.logger.log(
      `Webhook secret rotated for merchant ${endpoint.merchantProfileId}`,
    );
    return { endpoint: toEndpointView(updated), signingSecret };
  }

  async remove(userId: string): Promise<void> {
    const endpoint = await this.requireEndpoint(userId);
    await this.webhooksRepository.deleteEndpoint(endpoint.id);
    this.logger.log(
      `Webhook endpoint removed for merchant ${endpoint.merchantProfileId}`,
    );
  }

  /** Queues a test event and sends the first attempt straight away, so the merchant sees the result. */
  async sendTest(userId: string): Promise<WebhookDeliveryView> {
    const endpoint = await this.requireEndpoint(userId);
    const eventId = randomUUID();
    const delivery = await this.webhooksRepository.createDelivery({
      endpointId: endpoint.id,
      eventId,
      eventType: TEST_EVENT_TYPE,
      payload: {
        eventId,
        eventType: TEST_EVENT_TYPE,
        occurredAt: new Date().toISOString(),
        message:
          'Test event from SwiftDrop. Your webhook endpoint is reachable.',
      },
    });
    await this.deliveryService.attempt(delivery.id);
    return this.requireDeliveryView(delivery.id);
  }

  async listDeliveries(
    userId: string,
    limit = 20,
  ): Promise<WebhookDeliveryView[]> {
    const endpoint = await this.findEndpoint(userId);
    if (!endpoint) return [];
    const take = Math.min(
      Math.max(Math.trunc(limit) || 20, 1),
      MAX_LISTED_DELIVERIES,
    );
    const deliveries = await this.webhooksRepository.listDeliveries(
      endpoint.id,
      take,
    );
    return deliveries.map(toDeliveryView);
  }

  /** Sends a failed delivery again from attempt 1. */
  async redeliver(
    userId: string,
    deliveryId: string,
  ): Promise<WebhookDeliveryView> {
    const endpoint = await this.requireEndpoint(userId);
    const delivery = await this.webhooksRepository.findDeliveryForEndpoint(
      deliveryId,
      endpoint.id,
    );
    if (!delivery) {
      throw new NotFoundException('Webhook delivery not found');
    }
    if (delivery.status !== WebhookDeliveryStatus.FAILED) {
      throw new ConflictException('Only failed deliveries can be sent again');
    }
    await this.webhooksRepository.requeue(delivery.id, new Date());
    await this.deliveryService.attempt(delivery.id);
    return this.requireDeliveryView(delivery.id);
  }

  private validateUrl(rawUrl: string): string {
    const check = checkWebhookUrl(rawUrl, {
      allowLocal: this.settings.allowLocalUrls,
    });
    if (!check.ok) {
      throw new BadRequestException(check.reason);
    }
    return check.url;
  }

  private encrypt(secret: string, merchantProfileId: string): string {
    return encryptWebhookSecret(
      secret,
      this.settings.encryptionKey(),
      merchantProfileId,
    );
  }

  private async findEndpoint(userId: string): Promise<WebhookEndpoint | null> {
    const merchantProfileId = await this.requireMerchantProfileId(userId);
    return this.webhooksRepository.findEndpoint(merchantProfileId);
  }

  private async requireEndpoint(userId: string): Promise<WebhookEndpoint> {
    const endpoint = await this.findEndpoint(userId);
    if (!endpoint) {
      throw new NotFoundException('No webhook endpoint registered');
    }
    return endpoint;
  }

  private async requireMerchantProfileId(userId: string): Promise<string> {
    const id = await this.profilesRepository.findIdByUserId(userId);
    if (!id) {
      throw new NotFoundException('No merchant profile found for this account');
    }
    return id;
  }

  private async requireDeliveryView(id: string): Promise<WebhookDeliveryView> {
    const delivery = await this.webhooksRepository.findDeliveryWithAttempts(id);
    if (!delivery) throw new NotFoundException('Webhook delivery not found');
    return toDeliveryView(delivery);
  }
}

function toEndpointView(endpoint: WebhookEndpoint): WebhookEndpointView {
  return {
    url: endpoint.url,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

function toDeliveryView(delivery: DeliveryWithAttempts): WebhookDeliveryView {
  return {
    id: delivery.id,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    nextAttemptAt: delivery.nextAttemptAt,
    lastStatusCode: delivery.lastStatusCode,
    lastError: delivery.lastError,
    deliveredAt: delivery.deliveredAt,
    createdAt: delivery.createdAt,
    attempts: delivery.attempts.map((a) => ({
      attemptNumber: a.attemptNumber,
      statusCode: a.statusCode,
      error: a.error,
      durationMs: a.durationMs,
      attemptedAt: a.attemptedAt,
    })),
  };
}
