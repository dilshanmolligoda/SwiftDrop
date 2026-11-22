import { Injectable } from '@nestjs/common';
import type { WebhookDeliveryStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

const ENDPOINT_FIELDS = {
  id: true,
  url: true,
  isActive: true,
  secretHint: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface WebhookEndpointRecord {
  id: string;
  url: string;
  isActive: boolean;
  secretHint: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDeliveryRecord {
  id: string;
  eventId: string;
  eventType: string;
  trackingNumber: string;
  attempt: number;
  status: WebhookDeliveryStatus;
  responseStatus: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class MerchantWebhooksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findEndpoint(merchantUserId: string): Promise<WebhookEndpointRecord | null> {
    return this.prisma.webhookEndpoint.findUnique({
      where: { merchantUserId },
      select: ENDPOINT_FIELDS,
    });
  }

  createEndpoint(data: {
    merchantUserId: string;
    url: string;
    secretEncrypted: string;
    secretHint: string;
  }): Promise<WebhookEndpointRecord> {
    return this.prisma.webhookEndpoint.create({
      data: { ...data, isActive: true },
      select: ENDPOINT_FIELDS,
    });
  }

  updateEndpoint(
    merchantUserId: string,
    data: Partial<{
      url: string;
      isActive: boolean;
      secretEncrypted: string;
      secretHint: string;
    }>,
  ): Promise<WebhookEndpointRecord> {
    return this.prisma.webhookEndpoint.update({
      where: { merchantUserId },
      data,
      select: ENDPOINT_FIELDS,
    });
  }

  /** Newest first; always scoped to the merchant's own endpoint. */
  async listDeliveries(
    merchantUserId: string,
    query: { page: number; pageSize: number; status?: WebhookDeliveryStatus },
  ): Promise<{ items: WebhookDeliveryRecord[]; total: number }> {
    const where = {
      endpoint: { merchantUserId },
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.webhookDelivery.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { attempt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          eventId: true,
          eventType: true,
          trackingNumber: true,
          attempt: true,
          status: true,
          responseStatus: true,
          durationMs: true,
          errorMessage: true,
          nextAttemptAt: true,
          createdAt: true,
        },
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);
    return { items, total };
  }
}
