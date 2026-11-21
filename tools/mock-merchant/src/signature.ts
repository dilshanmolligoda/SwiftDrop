import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Merchant-side check of a SwiftDrop webhook, written the way an external store
 * would write it from our docs: HMAC-SHA256 over `<timestamp>.<raw body>` with
 * the store's signing secret, sent as `X-SwiftDrop-Signature: sha256=<hex>`.
 *
 * It is deliberately independent of the API's own signer, so the demo proves a
 * third party can verify our webhooks using only the documentation.
 */

const TOLERANCE_SECONDS = 300;

export function verifySwiftDropSignature(
  secret: string,
  timestamp: string | undefined,
  rawBody: string,
  signature: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !signature || !timestamp || !/^\d+$/.test(timestamp)) {
    return false;
  }
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }

  const expected = Buffer.from(
    'sha256=' +
      createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex'),
  );
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
