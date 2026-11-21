import { Injectable } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

/**
 * Who may watch a parcel live — the same people who may read it over REST
 * (ARCHITECTURE.md §9.2):
 * - customer: parcels they booked
 * - courier: parcels currently assigned to them
 * - merchant: parcels created from their merchant orders
 * - dispatcher / admin: all parcels
 *
 * "Not yours" and "does not exist" give the same answer, so a socket can't be
 * used to discover parcel IDs.
 */
@Injectable()
export class ParcelAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async canWatch(user: AuthenticatedUser, parcelId: string): Promise<boolean> {
    switch (user.role) {
      case Role.ADMIN:
      case Role.DISPATCHER:
        return this.exists({ id: parcelId });
      case Role.CUSTOMER:
        return this.exists({ id: parcelId, customerId: user.id });
      case Role.MERCHANT:
        return this.exists({
          id: parcelId,
          merchantOrder: { merchantUserId: user.id },
        });
      case Role.COURIER:
        return this.exists({
          id: parcelId,
          assignments: { some: { courierId: user.id, endedAt: null } },
        });
      default:
        return false;
    }
  }

  private async exists(
    where: NonNullable<
      Parameters<PrismaService['parcel']['findFirst']>[0]
    >['where'],
  ): Promise<boolean> {
    const parcel = await this.prisma.parcel.findFirst({
      where,
      select: { id: true },
    });
    return parcel !== null;
  }
}
