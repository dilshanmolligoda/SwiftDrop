import type { DeliveryFailureReason, ParcelStatus } from '../enums/index.js';

/**
 * Messages published to the RabbitMQ `parcel.events` exchange through the
 * transactional outbox. The routing key is always the `eventType`.
 *
 * Rules:
 * - No personal data (names, phones, addresses, emails). Consumers look up what
 *   they need by ID.
 * - Never rename or remove a field. Add an optional field, or publish a V2.
 * - Delivery is at-least-once: consumers must dedupe on `eventId`.
 */

export const ParcelEventType = {
  CREATED: 'parcel.created',
  STATUS_CHANGED: 'parcel.status.changed',
} as const;
export type ParcelEventType =
  (typeof ParcelEventType)[keyof typeof ParcelEventType];

interface ParcelEventBaseV1<TType extends ParcelEventType> {
  /** UUID. Also the outbox row ID; consumers dedupe on it. */
  readonly eventId: string;
  readonly eventType: TType;
  readonly version: 1;
  /** ISO-8601 UTC time the change was committed. */
  readonly occurredAt: string;
  readonly parcelId: string;
  readonly trackingNumber: string;
  /** Merchant user ID for merchant parcels; null for customer parcels (no webhook). */
  readonly merchantId: string | null;
  /** Courier currently assigned, if any. Used to route real-time updates. */
  readonly courierId: string | null;
  /**
   * Increases with every event for the same parcel. Compare it only between
   * events of the same parcel, to drop updates that arrive out of order.
   */
  readonly sequence: number;
}

export interface ParcelCreatedV1
  extends ParcelEventBaseV1<typeof ParcelEventType.CREATED> {
  readonly status: ParcelStatus;
}

export interface ParcelStatusChangedV1
  extends ParcelEventBaseV1<typeof ParcelEventType.STATUS_CHANGED> {
  readonly previousStatus: ParcelStatus;
  readonly newStatus: ParcelStatus;
  /** Set only when `newStatus` is FAILED. */
  readonly failureReason: DeliveryFailureReason | null;
}

export type ParcelEventV1 = ParcelCreatedV1 | ParcelStatusChangedV1;

/** Status a parcel is in after the event, whichever event type it is. */
export function statusAfter(event: ParcelEventV1): ParcelStatus {
  return event.eventType === ParcelEventType.CREATED
    ? event.status
    : event.newStatus;
}

/** Status before the event; null for a newly created parcel. */
export function statusBefore(event: ParcelEventV1): ParcelStatus | null {
  return event.eventType === ParcelEventType.CREATED
    ? null
    : event.previousStatus;
}
