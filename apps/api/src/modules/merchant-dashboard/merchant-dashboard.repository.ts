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
  packageSize: 'SMALL' | 'MEDIUM' | 'LARGE' | null;
  weightKg: number | null;
  feeLkr: number | null;
  status: MerchantOrderStatus;
  source: 'API' | 'PORTAL';
  createdAt: Date;
  failedDeliveryAttempts: number;
  updatedAt: Date;
}

export interface MerchantOrderTimelineEvent {
  status: string;
  note: string | null;
  failureReason: string | null;
  createdAt: Date;
}

export interface MerchantOrderProof {
  id: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface MerchantOrderDetail extends MerchantOrderRecord {
  timeline: MerchantOrderTimelineEvent[];
  failureReason: string | null;
  proof: MerchantOrderProof | null;
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
    const createdFrom = query.createdFrom
      ? new Date(`${query.createdFrom}T00:00:00.000Z`)
      : null;
    const createdTo = query.createdTo
      ? new Date(`${query.createdTo}T00:00:00.000Z`)
      : null;
    if (createdTo) createdTo.setUTCDate(createdTo.getUTCDate() + 1);

    const [countRows, data] = await Promise.all([
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::INTEGER AS "total"
        FROM "merchant_orders" mo
        WHERE "merchantUserId" = ${merchantUserId}::uuid
          AND (
            CAST(${status} AS TEXT) IS NULL
            OR mo."status"::TEXT = CAST(${status} AS TEXT)
          )
          AND (
            CAST(${search} AS TEXT) IS NULL
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."reference")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."trackingNumber")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."recipientName")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."destination")) > 0
          )
          AND (CAST(${createdFrom} AS TIMESTAMPTZ) IS NULL OR mo."createdAt" >= CAST(${createdFrom} AS TIMESTAMPTZ))
          AND (CAST(${createdTo} AS TIMESTAMPTZ) IS NULL OR mo."createdAt" < CAST(${createdTo} AS TIMESTAMPTZ))
      `,
      this.prisma.$queryRaw<MerchantOrderRecord[]>`
        SELECT
          mo."id",
          mo."reference",
          mo."trackingNumber",
          mo."recipientName" AS "recipient",
          mo."destination",
          p."packageSize"::TEXT AS "packageSize",
          p."weightKg"::DOUBLE PRECISION AS "weightKg",
          p."costLkr"::DOUBLE PRECISION AS "feeLkr",
          mo."status"::TEXT AS "status",
          mo."source",
          mo."createdAt",
          mo."failedDeliveryAttempts",
          mo."updatedAt"
        FROM "merchant_orders" mo
        LEFT JOIN "parcels" p ON p."trackingNumber" = mo."trackingNumber"
        WHERE "merchantUserId" = ${merchantUserId}::uuid
          AND (
            CAST(${status} AS TEXT) IS NULL
            OR mo."status"::TEXT = CAST(${status} AS TEXT)
          )
          AND (
            CAST(${search} AS TEXT) IS NULL
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."reference")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."trackingNumber")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."recipientName")) > 0
            OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."destination")) > 0
          )
          AND (CAST(${createdFrom} AS TIMESTAMPTZ) IS NULL OR mo."createdAt" >= CAST(${createdFrom} AS TIMESTAMPTZ))
          AND (CAST(${createdTo} AS TIMESTAMPTZ) IS NULL OR mo."createdAt" < CAST(${createdTo} AS TIMESTAMPTZ))
        ORDER BY mo."updatedAt" DESC, mo."id" DESC
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

  listAllOrders(
    merchantUserId: string,
    query: ListMerchantOrdersDto,
  ): Promise<MerchantOrderRecord[]> {
    const status = query.status ?? null;
    const search = query.search?.trim() || null;
    const createdFrom = query.createdFrom
      ? new Date(`${query.createdFrom}T00:00:00.000Z`)
      : null;
    const createdTo = query.createdTo
      ? new Date(`${query.createdTo}T00:00:00.000Z`)
      : null;
    if (createdTo) createdTo.setUTCDate(createdTo.getUTCDate() + 1);

    return this.prisma.$queryRaw<MerchantOrderRecord[]>`
      SELECT
        mo."id",
        mo."reference",
        mo."trackingNumber",
        mo."recipientName" AS "recipient",
        mo."destination",
        p."packageSize"::TEXT AS "packageSize",
        p."weightKg"::DOUBLE PRECISION AS "weightKg",
        p."costLkr"::DOUBLE PRECISION AS "feeLkr",
        mo."status"::TEXT AS "status",
        mo."source",
        mo."createdAt",
        mo."failedDeliveryAttempts",
        mo."updatedAt"
      FROM "merchant_orders" mo
      LEFT JOIN "parcels" p ON p."trackingNumber" = mo."trackingNumber"
      WHERE mo."merchantUserId" = ${merchantUserId}::uuid
        AND (
          CAST(${status} AS TEXT) IS NULL
          OR mo."status"::TEXT = CAST(${status} AS TEXT)
        )
        AND (
          CAST(${search} AS TEXT) IS NULL
          OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."reference")) > 0
          OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."trackingNumber")) > 0
          OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."recipientName")) > 0
          OR POSITION(LOWER(CAST(${search} AS TEXT)) IN LOWER(mo."destination")) > 0
        )
        AND (CAST(${createdFrom} AS TIMESTAMPTZ) IS NULL OR mo."createdAt" >= CAST(${createdFrom} AS TIMESTAMPTZ))
        AND (CAST(${createdTo} AS TIMESTAMPTZ) IS NULL OR mo."createdAt" < CAST(${createdTo} AS TIMESTAMPTZ))
      ORDER BY mo."updatedAt" DESC, mo."id" DESC
    `;
  }

  async findOrder(
    merchantUserId: string,
    orderId: string,
  ): Promise<MerchantOrderDetail | null> {
    const rows = await this.prisma.$queryRaw<MerchantOrderRecord[]>`
      SELECT
        mo."id",
        mo."reference",
        mo."trackingNumber",
        mo."recipientName" AS "recipient",
        mo."destination",
        p."packageSize"::TEXT AS "packageSize",
        p."weightKg"::DOUBLE PRECISION AS "weightKg",
        p."costLkr"::DOUBLE PRECISION AS "feeLkr",
        mo."status"::TEXT AS "status",
        mo."source",
        mo."createdAt",
        mo."failedDeliveryAttempts",
        mo."updatedAt"
      FROM "merchant_orders" mo
      LEFT JOIN "parcels" p ON p."trackingNumber" = mo."trackingNumber"
      WHERE mo."merchantUserId" = ${merchantUserId}::uuid
        AND mo."id" = ${orderId}::uuid
      LIMIT 1
    `;

    const order = rows[0];
    if (!order) return null;

    const [timeline, proofRows, failureRows] = await Promise.all([
      this.prisma.$queryRaw<MerchantOrderTimelineEvent[]>`
        SELECT
          pse."status"::TEXT AS "status",
          pse."note",
          pse."failureReason"::TEXT AS "failureReason",
          pse."createdAt"
        FROM "merchant_orders" mo
        JOIN "parcels" p ON p."trackingNumber" = mo."trackingNumber"
        JOIN "parcel_status_events" pse ON pse."parcelId" = p."id"
        WHERE mo."id" = ${orderId}::uuid
          AND mo."merchantUserId" = ${merchantUserId}::uuid
        ORDER BY pse."createdAt" ASC
      `,
      this.prisma.$queryRaw<MerchantOrderProof[]>`
        SELECT
          dp."id",
          dp."originalFilename",
          dp."contentType",
          dp."sizeBytes",
          dp."uploadedAt"
        FROM "merchant_orders" mo
        JOIN "parcels" p ON p."trackingNumber" = mo."trackingNumber"
        JOIN "delivery_proofs" dp ON dp."parcelId" = p."id"
        WHERE mo."id" = ${orderId}::uuid
          AND mo."merchantUserId" = ${merchantUserId}::uuid
        ORDER BY dp."uploadedAt" DESC
        LIMIT 1
      `,
      this.prisma.$queryRaw<{ failureReason: string | null }[]>`
        SELECT p."failureReason" AS "failureReason"
        FROM "merchant_orders" mo
        JOIN "parcels" p ON p."trackingNumber" = mo."trackingNumber"
        WHERE mo."id" = ${orderId}::uuid
          AND mo."merchantUserId" = ${merchantUserId}::uuid
        LIMIT 1
      `,
    ]);

    return {
      ...order,
      timeline,
      failureReason: failureRows[0]?.failureReason ?? null,
      proof: proofRows[0] ?? null,
    };
  }
}
