import type { ParcelStatus } from '../enums/index.js';
import {
  statusAfter,
  statusBefore,
  type ParcelEventV1,
} from '../events/parcel-events.js';

/**
 * WebSocket (Socket.IO) contract between the API and the browser.
 * See docs/adr/0002-realtime-websocket.md.
 *
 * Connection: `io(origin, { path: REALTIME_SOCKET_PATH, withCredentials: true })`.
 * The server authenticates with the same httpOnly access-token cookie as REST.
 * Anonymous sockets may only subscribe to public tracking.
 *
 * Role rooms (merchant, courier, dispatch) are joined automatically on connect.
 * Parcel rooms are joined with `subscribe`, after an ownership check.
 *
 * After every (re)connect the client must re-read the current state over REST,
 * then apply live updates with a higher `sequence` — nothing sent while it was
 * disconnected is replayed.
 */

/** Under /api/ so the production reverse proxy forwards it unchanged. */
export const REALTIME_SOCKET_PATH = '/api/v1/realtime';

/** Events the server emits. */
export const RealtimeServerEvent = {
  PARCEL_UPDATED: 'parcel.updated',
  PUBLIC_PARCEL_UPDATED: 'public.parcel.updated',
} as const;
export type RealtimeServerEvent =
  (typeof RealtimeServerEvent)[keyof typeof RealtimeServerEvent];

/** Events the client emits (each takes an acknowledgement callback). */
export const RealtimeClientEvent = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
} as const;
export type RealtimeClientEvent =
  (typeof RealtimeClientEvent)[keyof typeof RealtimeClientEvent];

export type RealtimeSubscription =
  /** Signed-in user: customer (own), courier (assigned), merchant (own), dispatcher/admin. */
  | { readonly scope: 'parcel'; readonly parcelId: string }
  /** Anyone with a secure tracking number. Receives public fields only. */
  | { readonly scope: 'public'; readonly trackingNumber: string };

export type RealtimeErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'TOO_MANY_SUBSCRIPTIONS';

export type RealtimeAck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: RealtimeErrorCode };

/** Sent to signed-in users allowed to see the parcel. */
export interface RealtimeParcelUpdateV1 {
  readonly version: 1;
  readonly eventId: string;
  readonly parcelId: string;
  readonly trackingNumber: string;
  readonly status: ParcelStatus;
  readonly previousStatus: ParcelStatus | null;
  readonly occurredAt: string;
  readonly sequence: number;
}

/** Sent to public tracking subscribers: the same fields the public REST API returns. */
export interface PublicRealtimeParcelUpdateV1 {
  readonly version: 1;
  readonly trackingNumber: string;
  readonly status: ParcelStatus;
  readonly occurredAt: string;
  readonly sequence: number;
}

/** Room names. Only the server joins sockets to rooms. */
export const RealtimeRoom = {
  parcel: (parcelId: string) => `parcel:${parcelId}`,
  publicTracking: (trackingNumber: string) => `public:${trackingNumber}`,
  merchant: (merchantUserId: string) => `merchant:${merchantUserId}`,
  courier: (courierUserId: string) => `courier:${courierUserId}`,
  dispatch: 'dispatch',
} as const;

export function toRealtimeParcelUpdate(
  event: ParcelEventV1,
): RealtimeParcelUpdateV1 {
  return {
    version: 1,
    eventId: event.eventId,
    parcelId: event.parcelId,
    trackingNumber: event.trackingNumber,
    status: statusAfter(event),
    previousStatus: statusBefore(event),
    occurredAt: event.occurredAt,
    sequence: event.sequence,
  };
}

/** Public projection — built field by field so private data can't leak in. */
export function toPublicRealtimeParcelUpdate(
  event: ParcelEventV1,
): PublicRealtimeParcelUpdateV1 {
  return {
    version: 1,
    trackingNumber: event.trackingNumber,
    status: statusAfter(event),
    occurredAt: event.occurredAt,
    sequence: event.sequence,
  };
}

/** True when `incoming` should replace what the client last applied. */
export function isNewerUpdate(
  lastApplied: { readonly sequence: number } | null | undefined,
  incoming: { readonly sequence: number },
): boolean {
  return !lastApplied || incoming.sequence > lastApplied.sequence;
}
