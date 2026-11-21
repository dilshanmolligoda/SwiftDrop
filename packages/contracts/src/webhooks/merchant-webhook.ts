import type { DeliveryFailureReason, ParcelStatus } from '../enums/index.js';
import {
  statusAfter,
  statusBefore,
  type ParcelEventType,
  type ParcelEventV1,
} from '../events/parcel-events.js';

/**
 * What a merchant's server receives: `POST {webhook URL}` with this JSON body.
 * This is a public API for external systems — treat changes as breaking.
 *
 * Signature: `X-SwiftDrop-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">`
 * using the merchant's signing secret; reject if the timestamp is more than
 * WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS away from now.
 */
export interface MerchantWebhookPayloadV1 {
  /** Same for every retry of one event — dedupe on it. */
  readonly eventId: string;
  readonly eventType: ParcelEventType;
  readonly version: 1;
  readonly occurredAt: string;
  readonly trackingNumber: string;
  /** The merchant's own order reference, when the parcel came from a merchant order. */
  readonly merchantOrderRef: string | null;
  readonly status: ParcelStatus;
  readonly previousStatus: ParcelStatus | null;
  readonly failureReason: DeliveryFailureReason | null;
  /** Per-parcel order; ignore a webhook whose sequence is lower than one already processed. */
  readonly sequence: number;
}

export const WEBHOOK_HEADERS = {
  eventId: 'X-SwiftDrop-Event-Id',
  eventType: 'X-SwiftDrop-Event-Type',
  timestamp: 'X-SwiftDrop-Timestamp',
  signature: 'X-SwiftDrop-Signature',
  /** 1-based delivery attempt, for the merchant's logs. */
  attempt: 'X-SwiftDrop-Delivery-Attempt',
} as const;

export const WEBHOOK_SIGNATURE_SCHEME = 'sha256=';
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

/** Builds the merchant-facing body from an internal event. */
export function toMerchantWebhookPayload(
  event: ParcelEventV1,
  merchantOrderRef: string | null,
): MerchantWebhookPayloadV1 {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    version: 1,
    occurredAt: event.occurredAt,
    trackingNumber: event.trackingNumber,
    merchantOrderRef,
    status: statusAfter(event),
    previousStatus: statusBefore(event),
    failureReason:
      event.eventType === 'parcel.status.changed' ? event.failureReason : null,
    sequence: event.sequence,
  };
}
