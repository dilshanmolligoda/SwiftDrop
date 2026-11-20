import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { ApiKey } from '../../../generated/prisma/client.js';
import type { ApprovalStatus } from '../../../generated/prisma/enums.js';

export interface CreateApiKeyData {
  merchantProfileId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
}

/** An API key together with the merchant that owns it, for authenticating requests. */
export interface ApiKeyWithOwner extends ApiKey {
  merchantProfile: {
    id: string;
    businessName: string;
    user: {
      id: string;
      isActive: boolean;
      approvalStatus: ApprovalStatus;
    };
  };
}

@Injectable()
export class ApiKeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMerchantProfileIdByUserId(userId: string): Promise<string | null> {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  async countActive(merchantProfileId: string): Promise<number> {
    return this.prisma.apiKey.count({
      where: { merchantProfileId, revokedAt: null },
    });
  }

  async create(data: CreateApiKeyData): Promise<ApiKey> {
    return this.prisma.apiKey.create({ data });
  }

  async listByMerchant(merchantProfileId: string): Promise<ApiKey[]> {
    return this.prisma.apiKey.findMany({
      where: { merchantProfileId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Scoped to the merchant, so one merchant can never load another's key. */
  async findByIdForMerchant(
    id: string,
    merchantProfileId: string,
  ): Promise<ApiKey | null> {
    return this.prisma.apiKey.findFirst({
      where: { id, merchantProfileId },
    });
  }

  async revoke(id: string, revokedAt: Date): Promise<ApiKey> {
    return this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt },
    });
  }

  async findByPrefixWithOwner(
    keyPrefix: string,
  ): Promise<ApiKeyWithOwner | null> {
    return this.prisma.apiKey.findUnique({
      where: { keyPrefix },
      include: {
        merchantProfile: {
          select: {
            id: true,
            businessName: true,
            user: {
              select: { id: true, isActive: true, approvalStatus: true },
            },
          },
        },
      },
    });
  }

  async touchLastUsed(id: string, usedAt: Date): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: usedAt },
    });
  }
}
