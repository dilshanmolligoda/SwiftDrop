import { randomBytes } from 'node:crypto';
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  generateWebhookSecret,
  parseEncryptionKey,
  WEBHOOK_SECRET_PREFIX,
} from './webhook-secret.js';

const KEY = randomBytes(32);
const MERCHANT_ID = '6f1c2c8e-0000-4000-8000-000000000001';

describe('webhook-secret', () => {
  describe('generateWebhookSecret', () => {
    it('creates a prefixed, unique secret', () => {
      const secret = generateWebhookSecret();

      expect(secret.startsWith(WEBHOOK_SECRET_PREFIX)).toBe(true);
      expect(secret.length).toBeGreaterThan(40);
      expect(generateWebhookSecret()).not.toEqual(secret);
    });
  });

  describe('parseEncryptionKey', () => {
    it('accepts a base64-encoded 32-byte key', () => {
      expect(parseEncryptionKey(KEY.toString('base64'))).toEqual(KEY);
    });

    it.each([undefined, '', 'short', randomBytes(16).toString('base64')])(
      'rejects %p',
      (value) => {
        expect(() => parseEncryptionKey(value)).toThrow(/32 bytes/);
      },
    );
  });

  describe('encrypt / decrypt', () => {
    const secret = generateWebhookSecret();

    it('round-trips the secret', () => {
      const stored = encryptWebhookSecret(secret, KEY, MERCHANT_ID);
      expect(decryptWebhookSecret(stored, KEY, MERCHANT_ID)).toBe(secret);
    });

    it('never stores the secret in readable form', () => {
      const stored = encryptWebhookSecret(secret, KEY, MERCHANT_ID);

      expect(stored).not.toContain(secret);
      expect(stored.startsWith('v1.')).toBe(true);
    });

    it('produces different ciphertext each time (random IV)', () => {
      expect(encryptWebhookSecret(secret, KEY)).not.toEqual(
        encryptWebhookSecret(secret, KEY),
      );
    });

    it('fails with the wrong key', () => {
      const stored = encryptWebhookSecret(secret, KEY, MERCHANT_ID);
      expect(() =>
        decryptWebhookSecret(stored, randomBytes(32), MERCHANT_ID),
      ).toThrow();
    });

    it("fails when copied onto another merchant's row", () => {
      const stored = encryptWebhookSecret(secret, KEY, MERCHANT_ID);
      expect(() =>
        decryptWebhookSecret(stored, KEY, 'another-merchant-id'),
      ).toThrow();
    });

    it('fails when the stored value was tampered with', () => {
      const [version, iv, tag, data] = encryptWebhookSecret(secret, KEY).split(
        '.',
      );
      const flipped = Buffer.from(data, 'base64url');
      flipped[0] ^= 0xff;
      const tampered = [version, iv, tag, flipped.toString('base64url')].join(
        '.',
      );

      expect(() => decryptWebhookSecret(tampered, KEY)).toThrow();
    });

    it('rejects malformed stored values', () => {
      expect(() => decryptWebhookSecret('plain-text', KEY)).toThrow(/format/);
      expect(() => decryptWebhookSecret('v2.a.b.c', KEY)).toThrow(/format/);
      expect(() => decryptWebhookSecret('v1.a.b.c', KEY)).toThrow(/format/);
    });

    it('refuses to encrypt an empty secret', () => {
      expect(() => encryptWebhookSecret('', KEY)).toThrow();
    });
  });
});
