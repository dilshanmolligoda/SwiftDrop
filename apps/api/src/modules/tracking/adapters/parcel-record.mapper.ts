import { InternalServerErrorException } from '@nestjs/common';
import type { ParcelsService } from '../../parcels/parcels.service.js';
import type { ParcelReadRecord } from '../domain/parcel.types.js';

// Depend on the exported service contract, never import its repository.
export type StoredCustomerParcel = Awaited<
  ReturnType<ParcelsService['listForCustomer']>
>[number];

function iso(date: Date): string {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new InternalServerErrorException('Unable to read customer parcel');
  }
  return date.toISOString();
}

export function mapParcelRecord(
  parcel: StoredCustomerParcel,
): ParcelReadRecord {
  if (!Array.isArray(parcel.statusHistory)) {
    // Missing inclusion is an integration error, not confirmed empty history.
    throw new InternalServerErrorException(
      'Unable to read customer parcel history',
    );
  }
  const history = parcel.statusHistory
    .map((event) => ({
      id: event.id,
      status: event.status,
      occurredAt: iso(event.createdAt),
    }))
    .sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) ||
        (a.id === b.id ? 0 : a.id < b.id ? -1 : 1),
    );
  return {
    id: parcel.id,
    customerId: parcel.customerId,
    trackingNumber: parcel.trackingNumber,
    status: parcel.status,
    origin: parcel.senderAddress,
    destination: parcel.recipientAddress,
    createdAt: iso(parcel.createdAt),
    updatedAt: iso(parcel.updatedAt),
    ...(parcel.deliveredAt === null
      ? {}
      : { deliveredAt: iso(parcel.deliveredAt) }),
    // Free-text notes and locations are intentionally not copied to responses.
    history: history.map(({ status, occurredAt }) => ({ status, occurredAt })),
  };
}
