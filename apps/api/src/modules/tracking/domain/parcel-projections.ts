import type {
  CustomerTrackingResponse,
  DeliveryHistoryItem,
  ParcelReadRecord,
  PublicTrackingResponse,
} from './parcel.types.js';

/** Explicit allowlist: never spread storage records or status-history events. */
export function projectPublicTracking(
  parcel: Pick<
    ParcelReadRecord,
    'trackingNumber' | 'status' | 'updatedAt' | 'history'
  >,
): PublicTrackingResponse {
  return {
    trackingNumber: parcel.trackingNumber,
    status: parcel.status,
    ...(parcel.updatedAt === undefined ? {} : { updatedAt: parcel.updatedAt }),
    history: parcel.history.map((event) => ({
      status: event.status,
      occurredAt: event.occurredAt,
    })),
  };
}

export function projectCustomerTracking(
  parcel: ParcelReadRecord,
): CustomerTrackingResponse {
  return {
    ...projectPublicTracking(parcel),
    id: parcel.id,
    createdAt: parcel.createdAt,
    ...(parcel.deliveredAt === undefined
      ? {}
      : { deliveredAt: parcel.deliveredAt }),
    ...(parcel.origin === undefined ? {} : { origin: parcel.origin }),
    ...(parcel.destination === undefined
      ? {}
      : { destination: parcel.destination }),
  };
}

export function projectDeliveryHistory(
  parcel: ParcelReadRecord,
): DeliveryHistoryItem {
  return {
    id: parcel.id,
    trackingNumber: parcel.trackingNumber,
    status: parcel.status,
    createdAt: parcel.createdAt,
    ...(parcel.deliveredAt === undefined
      ? {}
      : { deliveredAt: parcel.deliveredAt }),
    ...(parcel.destination === undefined
      ? {}
      : { destination: parcel.destination }),
  };
}
