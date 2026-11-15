import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Every key starts with this, so a leaked key is easy to recognise. */
export const API_KEY_PREFIX = 'sd_';

/** 32 random bytes = 256 bits of entropy. */
const SECRET_BYTES = 32;

/** Characters after the prefix that are kept in plain text to identify the key. */
const LOOKUP_LENGTH = 8;

export interface GeneratedApiKey {
  /** Full key. Shown to the merchant once and never stored. */
  readonly plainKey: string;
  /** Non-secret start of the key, stored in plain text to find and display it. */
  readonly lookupPrefix: string;
}

export function generateApiKey(): GeneratedApiKey {
  const plainKey =
    API_KEY_PREFIX + randomBytes(SECRET_BYTES).toString('base64url');
  return { plainKey, lookupPrefix: plainKey.slice(0, lookupPrefixLength()) };
}

/**
 * Returns the lookup prefix of a key sent by a merchant, or null when the value
 * cannot be a SwiftDrop key (so the caller can reject it without a DB query).
 */
export function extractLookupPrefix(plainKey: string): string | null {
  if (
    !plainKey?.startsWith(API_KEY_PREFIX) ||
    plainKey.length <= lookupPrefixLength()
  ) {
    return null;
  }
  return plainKey.slice(0, lookupPrefixLength());
}

/**
 * Peppered SHA-256 (HMAC) of the key. The pepper comes from API_KEY_PEPPER and
 * never lives in the database, so a database leak alone does not expose keys.
 */
export function hashApiKey(plainKey: string, pepper: string): string {
  if (!pepper) {
    throw new Error('API key pepper must not be empty');
  }
  return createHmac('sha256', pepper).update(plainKey).digest('hex');
}

/** Constant-time comparison, so response timing does not leak the hash. */
export function verifyApiKey(
  plainKey: string,
  storedHash: string | null | undefined,
  pepper: string,
): boolean {
  if (!plainKey || !storedHash) {
    return false;
  }
  const actual = Buffer.from(hashApiKey(plainKey, pepper), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function lookupPrefixLength(): number {
  return API_KEY_PREFIX.length + LOOKUP_LENGTH;
}
