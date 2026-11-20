import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookEndpoint,
} from '../../../generated/prisma/client.js';
import { WebhookDeliveryStatus } from '../../../generated/prisma/enums.js';
import type { Prisma } from '../../../generated/prisma/client.js';

export type DeliveryWithAttempts = WebhookDelivery & {
  attempts: WebhookDeliveryAttempt[];
};

export type DeliveryWithEndpoint = WebhookDelivery & {
  endpoint: WebhookEndpoint;
};

export interface AttemptResult {
  attemptNumber: number;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
  status: WebhookDeliveryStatus;
  nextAttemptAt: Date | null;
}

@Injectable()
export class WebhooksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findEndpoint(merchantProfileId: string): Promise<WebhookEndpoint | null> {
    return this.prisma.webhookEndpoint.findUnique({
      where: { merchantProfileId },
    });
  }

  createEndpoint(data: {
    merchantProfileId: string;
    url: string;
    encryptedSecret: string;
  }): Promise<WebhookEndpoint> {
    return this.prisma.webhookEndpoint.create({ data });
  }

  updateEndpoint(
    id: string,
    data: { url?: string; encryptedSecret?: string },
  ): Promise<WebhookEndpoint> {
    return this.prisma.webhookEndpoint.update({ where: { id }, data });
  }

  async deleteEndpoint(id: string): Promise<void> {
    await this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  createDelivery(data: {
    endpointId: string;
    eventId: string;
    eventType: string;
    payload: Prisma.InputJsonValue;
  }): Promise<WebhookDelivery> {
    // Due now by the API's clock, which is the clock claimDelivery() compares with.
    return this.prisma.webhookDelivery.create({
      data: { ...data, nextAttemptAt: new Date() },
    });
  }

  listDeliveries(
    endpointId: string,
    limit: number,
  ): Promise<DeliveryWithAttempts[]> {
    return this.prisma.webhookDelivery.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { attempts: { orderBy: { attemptedAt: 'asc' } } },
    });
  }

  findDeliveryForEndpoint(
    id: string,
    endpointId: string,
  ): Promise<WebhookDelivery | null> {
    return this.prisma.webhookDelivery.findFirst({ where: { id, endpointId } });
  }

  findDeliveryWithAttempts(id: string): Promise<DeliveryWithAttempts | null> {
    return this.prisma.webhookDelivery.findUnique({
      where: { id },
      include: { attempts: { orderBy: { attemptedAt: 'asc' } } },
    });
  }

  /** IDs of deliveries whose next attempt is due. */
  async findDueDeliveryIds(now: Date, limit: number): Promise<string[]> {
    const due = await this.prisma.webhookDelivery.findMany({
      where: {
        status: WebhookDeliveryStatus.PENDING,
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return due.map((d) => d.id);
  }

  /**
   * Takes a due delivery for sending. Clearing nextAttemptAt means a second
   * poll (or another API instance) cannot pick up the same delivery meanwhile.
   */
  async claimDelivery(
    id: string,
    now: Date,
  ): Promise<DeliveryWithEndpoint | null> {
    const claimed = await this.prisma.webhookDelivery.updateMany({
      where: {
        id,
        status: WebhookDeliveryStatus.PENDING,
        nextAttemptAt: { lte: now },
      },
      data: { nextAttemptAt: null },
    });
    if (claimed.count === 0) return null;
    return this.prisma.webhookDelivery.findUnique({
      where: { id },
      include: { endpoint: true },
    });
  }

  /** Stores one HTTP attempt and the delivery's resulting state together. */
  async recordAttempt(
    deliveryId: string,
    result: AttemptResult,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.webhookDeliveryAttempt.create({
        data: {
          deliveryId,
          attemptNumber: result.attemptNumber,
          statusCode: result.statusCode,
          error: result.error,
          durationMs: result.durationMs,
        },
      }),
      this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          attemptCount: result.attemptNumber,
          status: result.status,
          nextAttemptAt: result.nextAttemptAt,
          lastStatusCode: result.statusCode,
          lastError: result.error,
          deliveredAt:
            result.status === WebhookDeliveryStatus.DELIVERED
              ? new Date()
              : undefined,
        },
      }),
    ]);
  }

  /** Puts a failed delivery back in the queue for a fresh round of attempts. */
  async requeue(id: string, now: Date): Promise<void> {
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: WebhookDeliveryStatus.PENDING,
        attemptCount: 0,
        nextAttemptAt: now,
      },
    });
  }

  /** After a crash, deliveries that were claimed but never finished get sent again. */
  async releaseStuckClaims(now: Date): Promise<number> {
    const released = await this.prisma.webhookDelivery.updateMany({
      where: { status: WebhookDeliveryStatus.PENDING, nextAttemptAt: null },
      data: { nextAttemptAt: now },
    });
    return released.count;
  }
}
