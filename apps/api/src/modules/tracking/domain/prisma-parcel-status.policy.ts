import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ParcelStatus } from '../../../generated/prisma/enums.js';
import {
  ParcelStatusPolicy,
  type ParcelStatusCategory,
} from '../ports/parcel-status-policy.port.js';

const CATEGORIES: Readonly<Record<ParcelStatus, ParcelStatusCategory>> = {
  PENDING: 'active',
  PICKED_UP: 'active',
  IN_TRANSIT: 'active',
  OUT_FOR_DELIVERY: 'active',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  RETURNED: 'other-terminal',
};

@Injectable()
export class PrismaParcelStatusPolicy extends ParcelStatusPolicy {
  classify(status: string): ParcelStatusCategory {
    if (!Object.prototype.hasOwnProperty.call(CATEGORIES, status)) {
      throw new ServiceUnavailableException(
        'Parcel status classification is unavailable',
      );
    }
    return CATEGORIES[status as ParcelStatus];
  }

  override needsAttention(status: string): boolean {
    this.classify(status);
    return status === ParcelStatus.FAILED || status === ParcelStatus.RETURNED;
  }
}
