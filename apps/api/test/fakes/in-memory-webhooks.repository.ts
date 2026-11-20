import { randomUUID } from 'node:crypto';
import type {
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookEndpoint,
} from '../../src/generated/prisma/client.js';
import { WebhookDeliveryStatus } from '../../src/generated/prisma/enums.js';
import type {
  AttemptResult,
  DeliveryWithAttempts,
  DeliveryWithEndpoint,
} from '../../src/modules/merchant-integration/repositories/webhooks.repository.js';

/**
 * Test double with the same behaviour as WebhooksRepository, kept in memory.
 * Only used by *.spec.ts files.
 */
export class InMemoryWebhooksRepository {
  readonly endpoints: WebhookEndpoint[] = [];
  readonly deliveries: WebhookDelivery[] = [];
  readonly attempts: WebhookDeliveryAttempt[] = [];

  findEndpoint(merchantProfileId: string) {
    return Promise.resolve(
      this.endpoints.find((e) => e.merchantProfileId === merchantProfileId) ??
        null,
    );
  }

  createEndpoint(data: {
    merchantProfileId: string;
    url: string;
    encryptedSecret: string;
  }) {
    const now = new Date();
    const endpoint: WebhookEndpoint = {
      id: randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.endpoints.push(endpoint);
    return Promise.resolve(endpoint);
  }

  updateEndpoint(id: string, data: { url?: string; encryptedSecret?: string }) {
    const endpoint = this.endpoints.find((e) => e.id === id)!;
    Object.assign(endpoint, data, { updatedAt: new Date() });
    return Promise.resolve(endpoint);
  }

  deleteEndpoint(id: string) {
    const index = this.endpoints.findIndex((e) => e.id === id);
    this.endpoints.splice(index, 1);
    return Promise.resolve();
  }

  createDelivery(data: {
    endpointId: string;
    eventId: string;
    eventType: string;
    payload: unknown;
  }) {
    const now = new Date();
    const delivery = {
      id: randomUUID(),
      ...data,
      status: WebhookDeliveryStatus.PENDING,
      attemptCount: 0,
      nextAttemptAt: now,
      lastStatusCode: null,
      lastError: null,
      deliveredAt: null,
      createdAt: now,
      updatedAt: now,
    } as WebhookDelivery;
    this.deliveries.push(delivery);
    return Promise.resolve(delivery);
  }

  listDeliveries(endpointId: string, limit: number) {
    return Promise.resolve(
      this.deliveries
        .filter((d) => d.endpointId === endpointId)
        .reverse()
        .slice(0, limit)
        .map((d) => this.withAttempts(d)),
    );
  }

  findDeliveryForEndpoint(id: string, endpointId: string) {
    return Promise.resolve(
      this.deliveries.find((d) => d.id === id && d.endpointId === endpointId) ??
        null,
    );
  }

  findDeliveryWithAttempts(id: string) {
    const delivery = this.deliveries.find((d) => d.id === id);
    return Promise.resolve(delivery ? this.withAttempts(delivery) : null);
  }

  findDueDeliveryIds(now: Date, limit: number) {
    return Promise.resolve(
      this.deliveries
        .filter(
          (d) =>
            d.status === WebhookDeliveryStatus.PENDING &&
            d.nextAttemptAt &&
            d.nextAttemptAt <= now,
        )
        .slice(0, limit)
        .map((d) => d.id),
    );
  }

  claimDelivery(id: string, now: Date): Promise<DeliveryWithEndpoint | null> {
    const delivery = this.deliveries.find((d) => d.id === id);
    if (
      !delivery ||
      delivery.status !== WebhookDeliveryStatus.PENDING ||
      !delivery.nextAttemptAt ||
      delivery.nextAttemptAt > now
    ) {
      return Promise.resolve(null);
    }
    delivery.nextAttemptAt = null;
    const endpoint = this.endpoints.find((e) => e.id === delivery.endpointId)!;
    return Promise.resolve({ ...delivery, endpoint });
  }

  recordAttempt(deliveryId: string, result: AttemptResult) {
    this.attempts.push({
      id: randomUUID(),
      deliveryId,
      attemptNumber: result.attemptNumber,
      statusCode: result.statusCode,
      error: result.error,
      durationMs: result.durationMs,
      attemptedAt: new Date(),
    });
    const delivery = this.deliveries.find((d) => d.id === deliveryId)!;
    Object.assign(delivery, {
      attemptCount: result.attemptNumber,
      status: result.status,
      nextAttemptAt: result.nextAttemptAt,
      lastStatusCode: result.statusCode,
      lastError: result.error,
      deliveredAt:
        result.status === WebhookDeliveryStatus.DELIVERED
          ? new Date()
          : delivery.deliveredAt,
    });
    return Promise.resolve();
  }

  requeue(id: string, now: Date) {
    Object.assign(
      this.deliveries.find((d) => d.id === id)!,
      {
        status: WebhookDeliveryStatus.PENDING,
        attemptCount: 0,
        nextAttemptAt: now,
      },
    );
    return Promise.resolve();
  }

  releaseStuckClaims() {
    return Promise.resolve(0);
  }

  private withAttempts(delivery: WebhookDelivery): DeliveryWithAttempts {
    return {
      ...delivery,
      attempts: this.attempts
        .filter((a) => a.deliveryId === delivery.id)
        .sort((a, b) => a.attemptedAt.getTime() - b.attemptedAt.getTime()),
    };
  }
}
