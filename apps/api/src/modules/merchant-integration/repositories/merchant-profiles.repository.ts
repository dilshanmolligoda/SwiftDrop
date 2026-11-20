import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';

/** Finds the merchant profile that owns integration settings (keys, webhook). */
@Injectable()
export class MerchantProfilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findIdByUserId(userId: string): Promise<string | null> {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }
}
