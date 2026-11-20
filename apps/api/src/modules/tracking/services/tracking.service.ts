import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import type { CustomerTrackingResponse } from '../domain/parcel.types.js';
import { projectCustomerTracking } from '../domain/parcel-projections.js';
import { normalizeTrackingNumber } from '../domain/tracking-number.js';
import { CustomerParcelReader } from '../ports/parcel-reader.port.js';
import { requireCustomer } from './customer-access.js';

@Injectable()
export class TrackingService {
  constructor(
    @Inject(CustomerParcelReader) private readonly reader: CustomerParcelReader,
  ) {}

  async getCustomerTracking(
    user: AuthenticatedUser | null | undefined,
    number: unknown,
  ): Promise<CustomerTrackingResponse> {
    const customerId = requireCustomer(user);
    const trackingNumber = normalizeTrackingNumber(number);
    const parcel = await this.reader.findCustomerParcel(
      customerId,
      trackingNumber,
    );
    if (
      !parcel ||
      parcel.customerId !== customerId ||
      parcel.trackingNumber !== trackingNumber
    ) {
      throw new NotFoundException('Parcel not found');
    }
    return projectCustomerTracking(parcel);
  }
}
