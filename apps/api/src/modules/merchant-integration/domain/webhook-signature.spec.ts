import {
  DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
  signWebhookPayload,
  verifyWebhookSignature,
} from './webhook-signature.js';

const SECRET = 'merchant-signing-secret';
const NOW = 1_800_000_000;
const TIMESTAMP = String(NOW);
const BODY = JSON.stringify({
  eventId: 'evt-1',
  trackingNumber: 'SD-7K2M9QX4',
  status: 'DELIVERED',
});

describe('webhook-signature', () => {
  describe('signWebhookPayload', () => {
    it('returns a sha256 signature', () => {
      expect(signWebhookPayload(SECRET, TIMESTAMP, BODY)).toMatch(
        /^sha256=[0-9a-f]{64}$/,
      );
    });

    it('is deterministic for the same input', () => {
      expect(signWebhookPayload(SECRET, TIMESTAMP, BODY)).toEqual(
        signWebhookPayload(SECRET, TIMESTAMP, BODY),
      );
    });

    it('changes when the body, timestamp or secret changes', () => {
      const original = signWebhookPayload(SECRET, TIMESTAMP, BODY);

      expect(signWebhookPayload(SECRET, TIMESTAMP, `${BODY} `)).not.toEqual(
        original,
      );
      expect(signWebhookPayload(SECRET, String(NOW + 1), BODY)).not.toEqual(
        original,
      );
      expect(signWebhookPayload('other-secret', TIMESTAMP, BODY)).not.toEqual(
        original,
      );
    });

    it('throws when the secret is empty', () => {
      expect(() => signWebhookPayload('', TIMESTAMP, BODY)).toThrow();
    });
  });

  describe('verifyWebhookSignature', () => {
    const signature = signWebhookPayload(SECRET, TIMESTAMP, BODY);

    it('accepts a valid, fresh signature', () => {
      expect(
        verifyWebhookSignature(SECRET, TIMESTAMP, BODY, signature, {
          nowSeconds: NOW + 10,
        }),
      ).toBe(true);
    });

    it('rejects a tampered body', () => {
      const tampered = BODY.replace('DELIVERED', 'FAILED');
      expect(
        verifyWebhookSignature(SECRET, TIMESTAMP, tampered, signature, {
          nowSeconds: NOW,
        }),
      ).toBe(false);
    });

    it('rejects a signature made with another secret', () => {
      expect(
        verifyWebhookSignature('other-secret', TIMESTAMP, BODY, signature, {
          nowSeconds: NOW,
        }),
      ).toBe(false);
    });

    it('rejects a replayed request older than the tolerance', () => {
      expect(
        verifyWebhookSignature(SECRET, TIMESTAMP, BODY, signature, {
          nowSeconds: NOW + DEFAULT_TIMESTAMP_TOLERANCE_SECONDS + 1,
        }),
      ).toBe(false);
    });

    it('rejects missing signatures and non-numeric timestamps', () => {
      expect(
        verifyWebhookSignature(SECRET, TIMESTAMP, BODY, undefined, {
          nowSeconds: NOW,
        }),
      ).toBe(false);
      expect(
        verifyWebhookSignature(SECRET, 'yesterday', BODY, signature, {
          nowSeconds: NOW,
        }),
      ).toBe(false);
    });
  });
});
