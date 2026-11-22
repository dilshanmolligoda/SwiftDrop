import { isISO8601 } from 'class-validator';
import { normalizeTrackingNumber } from '../domain/tracking-number.js';
import type { ReceiptData, ReceiptParty } from './receipt.types.js';

export class InvalidReceiptDataError extends Error {
  constructor(field: string) {
    // Field names aid diagnosis; never put customer values in errors/logs.
    super(`Missing or invalid receipt field: ${field}`);
    this.name = 'InvalidReceiptDataError';
  }
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidReceiptDataError(field);
  }
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  field: string,
  limit: number,
  multiline = false,
): string {
  if (typeof value !== 'string') throw new InvalidReceiptDataError(field);
  const normalized = value.replace(/\r\n/g, '\n').trim();
  // Preserve real Unicode names; reject control/bidi overrides, not their letters.
  const forbidden = Array.from(normalized).some((character) => {
    const code = character.codePointAt(0)!;
    return (
      (code < 32 && !(multiline && code === 10)) ||
      (code >= 127 && code <= 159) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    );
  });
  if (
    !normalized ||
    normalized.length > limit ||
    forbidden ||
    (multiline && normalized.split('\n').length > 8)
  ) {
    throw new InvalidReceiptDataError(field);
  }
  return normalized;
}

function instant(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !isISO8601(value, { strict: true, strictSeparator: true }) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new InvalidReceiptDataError(field);
  return value;
}

function party(value: unknown, field: string): ReceiptParty {
  const source = object(value, field);
  return {
    name: text(source.name, `${field}.name`, 100),
    ...(source.phone === undefined
      ? {}
      : { phone: text(source.phone, `${field}.phone`, 40) }),
  };
}

/** Validation does not establish trust. Call only with a server reader's snapshot. */
export function validateReceiptData(value: unknown): ReceiptData {
  const source = object(value, 'receipt');
  let trackingNumber: string;
  try {
    trackingNumber = normalizeTrackingNumber(source.trackingNumber);
  } catch {
    throw new InvalidReceiptDataError('trackingNumber');
  }
  if (
    typeof source.deliveryFeeMinor !== 'number' ||
    !Number.isSafeInteger(source.deliveryFeeMinor) ||
    source.deliveryFeeMinor < 0
  )
    throw new InvalidReceiptDataError('deliveryFeeMinor');
  // Other currencies require an explicitly agreed currency/scale contract.
  if (source.currency !== 'LKR') throw new InvalidReceiptDataError('currency');
  const bookedAt = instant(source.bookedAt, 'bookedAt');
  const deliveredAt =
    source.deliveredAt === undefined
      ? undefined
      : instant(source.deliveredAt, 'deliveredAt');
  if (deliveredAt && Date.parse(deliveredAt) < Date.parse(bookedAt)) {
    throw new InvalidReceiptDataError('deliveredAt');
  }
  return {
    reference: text(source.reference, 'reference', 80),
    trackingNumber,
    bookedAt,
    sender: party(source.sender, 'sender'),
    recipient: party(source.recipient, 'recipient'),
    pickupAddress: text(source.pickupAddress, 'pickupAddress', 500, true),
    destinationAddress: text(
      source.destinationAddress,
      'destinationAddress',
      500,
      true,
    ),
    deliveryFeeMinor: source.deliveryFeeMinor,
    currency: 'LKR',
    ...(source.deliveryStatus === undefined
      ? {}
      : { deliveryStatus: text(source.deliveryStatus, 'deliveryStatus', 80) }),
    ...(deliveredAt === undefined ? {} : { deliveredAt }),
  };
}
