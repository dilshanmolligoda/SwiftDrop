import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma.service.js';
import type { WebhookDeliveryStatus } from '../generated/prisma/enums.js';

export interface ActiveEndpoint {
  readonly id: string;
  readonly merchantUserId: string;
  readonly url: string;
  readonly secretEncrypted: string;
}

export interface DeliveryRecord {
  readonly endpointId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly trackingNumber: string;
  readonly attempt: number;
  readonly status: WebhookDeliveryStatus;
  readonly requestUrl: string;
  readonly responseStatus: number | null;
  readonly durationMs: number | null;
  readonly errorMessage: string | null;
  readonly nextAttemptAt: Date | null;
}

@Injectable()
export class WebhookDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveEndpoint(merchantUserId: string): Promise<ActiveEndpoint | null> {
    return this.prisma.webhookEndpoint.findFirst({
      where: { merchantUserId, isActive: true },
      select: {
        id: true,
        merchantUserId: true,
        url: true,
        secretEncrypted: true,
      },
    });
  }

  findAttempt(endpointId: string, eventId: string, attempt: number) {
    return this.prisma.webhookDelivery.findUnique({
      where: { endpointId_eventId_attempt: { endpointId, eventId, attempt } },
      select: { status: true, nextAttemptAt: true },
    });
  }

  /**
   * The merchant's own order reference for the parcel, only if the parcel's
   * merchant order really belongs to that merchant.
   */
  async merchantOrderRef(
    parcelId: string,
    merchantUserId: string,
  ): Promise<string | null> {
    const parcel = await this.prisma.parcel.findUnique({
      where: { id: parcelId },
      select: {
        merchantOrder: { select: { reference: true, merchantUserId: true } },
      },
    });
    const order = parcel?.merchantOrder;
    return order && order.merchantUserId === merchantUserId
      ? order.reference
      : null;
  }

  /** Idempotent: recording the same attempt twice keeps the first row. */
  async recordAttempt(record: DeliveryRecord): Promise<void> {
    await this.prisma.webhookDelivery.createMany({
      data: [
        {
          ...record,
          errorMessage: record.errorMessage?.slice(0, 500) ?? null,
        },
      ],
      skipDuplicates: true,
    });
  }
}
