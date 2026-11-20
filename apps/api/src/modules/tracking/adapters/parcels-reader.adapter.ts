import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ParcelsService } from '../../parcels/parcels.service.js';
import type { ParcelReadRecord } from '../domain/parcel.types.js';
import { normalizeTrackingNumber } from '../domain/tracking-number.js';
import { CustomerParcelReader } from '../ports/parcel-reader.port.js';
import { mapParcelRecord } from './parcel-record.mapper.js';

@Injectable()
export class ParcelsReaderAdapter extends CustomerParcelReader {
  constructor(private readonly parcels: ParcelsService) {
    super();
  }

  async findCustomerParcel(
    customerId: string,
    number: string,
  ): Promise<ParcelReadRecord | null> {
    const trackingNumber = normalizeTrackingNumber(number);
    // Interim implementation: query only this customer's records, never all users.
    // Replace with an exported indexed customerId+trackingNumber query at scale.
    const records = await this.parcels.listForCustomerTracking(customerId);
    const parcel = records.find(
      (record) =>
        record.customerId === customerId &&
        record.trackingNumber === trackingNumber,
    );
    return parcel ? mapParcelRecord(parcel) : null;
  }

  async listCustomerParcels(
    customerId: string,
  ): Promise<readonly ParcelReadRecord[]> {
    const records = await this.parcels.listForCustomerTracking(customerId);
    if (records.some((record) => record.customerId !== customerId)) {
      throw new InternalServerErrorException(
        'Unable to read customer deliveries',
      );
    }
    return records.map(mapParcelRecord);
  }
}
