import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { MerchantOrderStatus } from './merchant-order-status.js';
import type { ListMerchantOrdersDto } from './dto/list-merchant-orders.dto.js';

export interface MerchantOrderRecord {
  id: string;
  reference: string;
  trackingNumber: string;
  recipient: string;
  destination: string;
  status: MerchantOrderStatus;
  failedDeliveryAttempts: number;
  updatedAt: Date;
}

export interface MerchantDashboardMetrics {
  activeDeliveries: number;
  deliveredThisMonth: number;
  needsAttention: number;
}

export interface MerchantOrdersPage {
  data: MerchantOrderRecord[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class MerchantDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(merchantUserId: string): Promise<{
    metrics: MerchantDashboardMetrics;
    recentOrders: MerchantOrderRecord[];
  }> {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    const [metricRows, recentOrders] = await Promise.all([
      this.prisma.$queryRaw<MerchantDashboardMetrics[]>`
        SELECT
          COUNT(*) FILTER (
            WHERE "status" IN (
              'AWAITING_PICKUP',
              'OUT_FOR_DELIVERY',
              'IN_TRANSIT',
              'PICKED_UP'
            )
          )::INTEGER AS "activeDeliveries",
          COUNT(*) FILTER (
            WHERE "status" = 'DELIVERED'
              AND "deliveredAt" >= ${monthStart}
              AND "deliveredAt" < ${nextMonthStart}
          )::INTEGER AS "deliveredThisMonth",
          COALESCE(SUM("failedDeliveryAttempts"), 0)::INTEGER AS "needsAttention"
        FROM "merchant_orders"
        WHERE "merchantUserId" = ${merchantUserId}::uuid
      `,
      this.prisma.$queryRaw<MerchantOrderRecord[]>`
        SELECT
          "id",
          "reference",
          "trackingNumber",
          "recipientName" AS "recipient",
          "destination",
          "status"::TEXT AS "status",
          "failedDeliveryAttempts",
          "updatedAt"
        FROM "merchant_orders"
        WHERE "merchantUserId" = ${merchantUserId}::uuid
        ORDER BY "updatedAt" DESC, "id" DESC
        LIMIT 6
      `,
    ]);

    const metrics = metricRows[0];
    if (!metrics) {
      throw new Error('Merchant dashboard metrics query returned no result');
    }

    return { metrics, recentOrders };
  }

  async listOrders(
    merchantUserId: string,
    query: ListMerchantOrdersDto,
  ): Promise<MerchantOrdersPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const status = query.status ?? null;
    const search = query.search?.trim() || null;

    const [countRows, data] = await Promise.all([
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::INTEGER AS "total"
        FROM "merchant_orders"
        WHERE "merchantUserId" = ${merchantUserId}::uuid
          AND (
            CAST(${status} AS TEXT) IS NULL
            OR "status"::TEXT = CAST(${status} AS TEXT)
          )
          AND (
            CAST(${search} AS TEXT) IS NULL
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER("reference")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER("trackingNumber")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER("recipientName")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER("destination")) > 0
          )
      `,
      this.prisma.$queryRaw<MerchantOrderRecord[]>`
        SELECT
          "id",
          "reference",
          "trackingNumber",
          "recipientName" AS "recipient",
          "destination",
          "status"::TEXT AS "status",
          "failedDeliveryAttempts",
          "updatedAt"
        FROM "merchant_orders"
        WHERE "merchantUserId" = ${merchantUserId}::uuid
          AND (
            CAST(${status} AS TEXT) IS NULL
            OR "status"::TEXT = CAST(${status} AS TEXT)
          )
          AND (
            CAST(${search} AS TEXT) IS NULL
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER("reference")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER("trackingNumber")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER("recipientName")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER("destination")) > 0
          )
        ORDER BY "updatedAt" DESC, "id" DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `,
    ]);

    const count = countRows[0];
    if (!count) {
      throw new Error('Merchant orders count query returned no result');
    }

    return { data, page, pageSize, total: count.total };
  }

  async findOrder(
    merchantUserId: string,
    orderId: string,
  ): Promise<MerchantOrderRecord | null> {
    const rows = await this.prisma.$queryRaw<MerchantOrderRecord[]>`
      SELECT
        "id",
        "reference",
        "trackingNumber",
        "recipientName" AS "recipient",
        "destination",
        "status"::TEXT AS "status",
        "failedDeliveryAttempts",
        "updatedAt"
      FROM "merchant_orders"
      WHERE "merchantUserId" = ${merchantUserId}::uuid
        AND "id" = ${orderId}::uuid
      LIMIT 1
    `;

    return rows[0] ?? null;
  }
}
