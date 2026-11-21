import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { projectPublicTracking } from '../domain/parcel-projections.js';
import type { PublicTrackingResponse } from '../domain/parcel.types.js';
import { normalizeTrackingNumber } from '../domain/tracking-number.js';
import { PublicParcelReader } from '../ports/parcel-reader.port.js';
import { isPublicTrackingNumber } from '../../parcels/parcel-tracking-number.js';

/** Separate from private customer lookups; legacy identifiers are never public. */
@Injectable()
export class PublicTrackingService {
  constructor(
    @Inject(PublicParcelReader) private readonly reader: PublicParcelReader,
  ) {}

  async getPublicTracking(number: unknown): Promise<PublicTrackingResponse> {
    const trackingNumber = normalizeTrackingNumber(number);
    if (!isPublicTrackingNumber(trackingNumber)) {
      throw new NotFoundException('Parcel not found');
    }
    const parcel = await this.reader.findPublicParcel(trackingNumber);
    if (!parcel || parcel.trackingNumber !== trackingNumber) {
      throw new NotFoundException('Parcel not found');
    }
    return projectPublicTracking(parcel);
  }
}
