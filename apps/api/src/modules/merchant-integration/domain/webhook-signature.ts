import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_HEADERS = {
  eventId: 'X-SwiftDrop-Event-Id',
  timestamp: 'X-SwiftDrop-Timestamp',
  signature: 'X-SwiftDrop-Signature',
} as const;

const SIGNATURE_SCHEME = 'sha256=';

/** Merchants should reject webhooks older than this, to stop replayed requests. */
export const DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = 300;

/**
 * Signs `<timestamp>.<body>` with the merchant's secret. Including the timestamp
 * means an old captured request cannot be re-sent with a fresh timestamp.
 *
 * @param timestamp Unix time in seconds, sent in the X-SwiftDrop-Timestamp header.
 * @param body The exact raw JSON string sent as the request body.
 */
export function signWebhookPayload(
  secret: string,
  timestamp: string,
  body: string,
): string {
  if (!secret) {
    throw new Error('Webhook signing secret must not be empty');
  }
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return SIGNATURE_SCHEME + digest;
}

export interface VerifyWebhookOptions {
  /** Current Unix time in seconds. Defaults to the system clock. */
  readonly nowSeconds?: number;
  readonly toleranceSeconds?: number;
}

/** What a merchant (and our mock merchant store) runs to trust a webhook. */
export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string | null | undefined,
  options: VerifyWebhookOptions = {},
): boolean {
  if (!secret || !signature || !/^\d+$/.test(timestamp)) {
    return false;
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance =
    options.toleranceSeconds ?? DEFAULT_TIMESTAMP_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) {
    return false;
  }

  const expected = Buffer.from(signWebhookPayload(secret, timestamp, body));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
