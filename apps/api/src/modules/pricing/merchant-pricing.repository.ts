import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

export interface MerchantPricingCharge {
  id: string;
  reference: string;
  trackingNumber: string;
  destination: string;
  packageSize: 'SMALL' | 'MEDIUM' | 'LARGE' | null;
  weightKg: number | null;
  feeLkr: number | null;
  createdAt: Date;
}

@Injectable()
export class MerchantPricingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCharges(
    merchantUserId: string,
    from: Date,
    to: Date,
  ): Promise<MerchantPricingCharge[]> {
    return this.prisma.$queryRaw<MerchantPricingCharge[]>`
      SELECT
        mo."id",
        mo."reference",
        mo."trackingNumber",
        mo."destination",
        p."packageSize"::TEXT AS "packageSize",
        p."weightKg"::DOUBLE PRECISION AS "weightKg",
        p."costLkr"::DOUBLE PRECISION AS "feeLkr",
        mo."createdAt"
      FROM "merchant_orders" mo
      LEFT JOIN "parcels" p ON p."trackingNumber" = mo."trackingNumber"
      WHERE mo."merchantUserId" = ${merchantUserId}::uuid
        AND mo."createdAt" >= ${from}
        AND mo."createdAt" < ${to}
      ORDER BY mo."createdAt" DESC, mo."id" DESC
    `;
  }
}
