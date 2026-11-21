import { InternalServerErrorException } from '@nestjs/common';
import type { ParcelsService } from '../../parcels/parcels.service.js';
import type { ParcelReadRecord } from '../domain/parcel.types.js';
import { mergeParcelEvents } from '../domain/parcel-events.js';

// Depend on the exported service contract, never import its repository.
export type StoredCustomerParcel = Awaited<
  ReturnType<ParcelsService['listForCustomerTracking']>
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
  if (
    !Array.isArray(parcel.statusHistory) ||
    !Array.isArray(parcel.statusEvents)
  ) {
    // Missing inclusion is an integration error, not confirmed empty history.
    throw new InternalServerErrorException(
      'Unable to read customer parcel history',
    );
  }
  const history = mergeParcelEvents(parcel.statusHistory, parcel.statusEvents);
  // Prefer the explicit parcel column. For courier-written deliveries with no
  // column timestamp, project the latest real DELIVERED courier event instead.
  // This is a read projection, not a database backfill or a synthetic event.
  const deliveredAt =
    parcel.deliveredAt !== null
      ? iso(parcel.deliveredAt)
      : parcel.status === 'DELIVERED'
        ? parcel.statusEvents
            .filter((event) => event.status === 'DELIVERED')
            .map((event) => iso(event.createdAt))
            .sort()
            .at(-1)
        : undefined;
  return {
    id: parcel.id,
    customerId: parcel.customerId,
    trackingNumber: parcel.trackingNumber,
    status: parcel.status,
    origin: parcel.senderAddress,
    destination: parcel.recipientAddress,
    createdAt: iso(parcel.createdAt),
    updatedAt: iso(parcel.updatedAt),
    ...(deliveredAt === undefined ? {} : { deliveredAt }),
    // Free-text notes and locations are intentionally not copied to responses.
    history,
  };
}
