import { isDeliveryFailureReason, isParcelStatus } from '../enums/index.js';
import {
  ParcelEventType,
  type ParcelCreatedV1,
  type ParcelEventV1,
  type ParcelStatusChangedV1,
} from './parcel-events.js';

/**
 * Checks a message body taken off RabbitMQ before a consumer trusts it.
 * A message that fails here can never succeed, so consumers dead-letter it
 * instead of retrying.
 */

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const MAX_TRACKING_NUMBER_LENGTH = 64;

type Fields = Record<string, unknown>;

export function parseParcelEvent(input: unknown): ParseResult<ParcelEventV1> {
  let body = input;
  if (typeof body === 'string' || body instanceof Uint8Array) {
    try {
      body = JSON.parse(
        typeof body === 'string' ? body : new TextDecoder().decode(body),
      );
    } catch {
      return fail('body is not valid JSON');
    }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail('body must be a JSON object');
  }
  const fields = body as Fields;

  if (fields.version !== 1) {
    return fail(`unsupported version: ${String(fields.version)}`);
  }
  const baseError = checkBase(fields);
  if (baseError) return fail(baseError);

  switch (fields.eventType) {
    case ParcelEventType.CREATED:
      return parseCreated(fields);
    case ParcelEventType.STATUS_CHANGED:
      return parseStatusChanged(fields);
    default:
      return fail(`unknown eventType: ${String(fields.eventType)}`);
  }
}

function checkBase(f: Fields): string | null {
  if (!isUuid(f.eventId)) return 'eventId must be a UUID';
  if (!isIsoUtc(f.occurredAt)) return 'occurredAt must be an ISO-8601 UTC time';
  if (!isUuid(f.parcelId)) return 'parcelId must be a UUID';
  if (
    typeof f.trackingNumber !== 'string' ||
    f.trackingNumber.length === 0 ||
    f.trackingNumber.length > MAX_TRACKING_NUMBER_LENGTH
  ) {
    return 'trackingNumber must be a non-empty string';
  }
  if (f.merchantId !== null && !isUuid(f.merchantId)) {
    return 'merchantId must be a UUID or null';
  }
  if (f.courierId !== null && !isUuid(f.courierId)) {
    return 'courierId must be a UUID or null';
  }
  if (!Number.isSafeInteger(f.sequence) || (f.sequence as number) < 1) {
    return 'sequence must be a positive integer';
  }
  return null;
}

function parseCreated(f: Fields): ParseResult<ParcelCreatedV1> {
  if (!isParcelStatus(f.status)) return fail('status is not a ParcelStatus');
  return {
    ok: true,
    value: {
      ...pickBase(f),
      eventType: ParcelEventType.CREATED,
      status: f.status,
    },
  };
}

function parseStatusChanged(f: Fields): ParseResult<ParcelStatusChangedV1> {
  if (!isParcelStatus(f.previousStatus)) {
    return fail('previousStatus is not a ParcelStatus');
  }
  if (!isParcelStatus(f.newStatus)) {
    return fail('newStatus is not a ParcelStatus');
  }
  if (f.failureReason !== null && !isDeliveryFailureReason(f.failureReason)) {
    return fail('failureReason is not a DeliveryFailureReason or null');
  }
  if (f.newStatus !== 'FAILED' && f.failureReason !== null) {
    return fail('failureReason is only allowed when newStatus is FAILED');
  }
  return {
    ok: true,
    value: {
      ...pickBase(f),
      eventType: ParcelEventType.STATUS_CHANGED,
      previousStatus: f.previousStatus,
      newStatus: f.newStatus,
      failureReason: f.failureReason,
    },
  };
}

/** Copies only known fields, so unexpected extra fields never travel further. */
function pickBase(f: Fields) {
  return {
    eventId: f.eventId as string,
    version: 1 as const,
    occurredAt: f.occurredAt as string,
    parcelId: f.parcelId as string,
    trackingNumber: f.trackingNumber as string,
    merchantId: f.merchantId as string | null,
    courierId: f.courierId as string | null,
    sequence: f.sequence as number,
  };
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function isIsoUtc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ISO_UTC.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
