import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Per-merchant webhook signing secrets.
 *
 * Unlike API keys (which are only compared, so a hash is enough), the worker
 * needs the real secret back to sign each webhook. The secret is therefore
 * encrypted at rest with AES-256-GCM using WEBHOOK_SECRET_ENCRYPTION_KEY, which
 * lives only in the environment, never in the database.
 *
 * Stored format: `v1.<iv>.<auth tag>.<ciphertext>` (base64url parts). The
 * version lets us rotate the key or algorithm later.
 */

export const WEBHOOK_SECRET_PREFIX = 'whsec_';

const FORMAT_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/** New signing secret, shown to the merchant once when the webhook is set up. */
export function generateWebhookSecret(): string {
  return WEBHOOK_SECRET_PREFIX + randomBytes(32).toString('base64url');
}

/** Decodes WEBHOOK_SECRET_ENCRYPTION_KEY and checks it is exactly 32 bytes. */
export function parseEncryptionKey(base64Key: string | undefined): Buffer {
  const key = Buffer.from(base64Key ?? '', 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `WEBHOOK_SECRET_ENCRYPTION_KEY must be ${KEY_BYTES} bytes, base64-encoded. ` +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  return key;
}

/**
 * @param context Bound into the ciphertext (e.g. the merchant ID), so an
 *   encrypted secret copied onto another merchant's row will not decrypt.
 */
export function encryptWebhookSecret(
  secret: string,
  key: Buffer,
  context = '',
): string {
  if (!secret) {
    throw new Error('Webhook secret must not be empty');
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);

  return [FORMAT_VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) =>
      typeof part === 'string' ? part : part.toString('base64url'),
    )
    .join('.');
}

/** Throws if the value was tampered with, or the key or context is wrong. */
export function decryptWebhookSecret(
  stored: string,
  key: Buffer,
  context = '',
): string {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error('Unrecognised encrypted webhook secret format');
  }
  const [, iv, authTag, ciphertext] = parts.map((part) =>
    Buffer.from(part, 'base64url'),
  );
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error('Unrecognised encrypted webhook secret format');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
