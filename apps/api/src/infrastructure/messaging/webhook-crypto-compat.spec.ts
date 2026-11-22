import * as shared from '@swiftdrop/contracts/node';
import * as retryShared from '@swiftdrop/contracts';
import * as apiPolicy from '../../modules/merchant-integration/domain/webhook-retry-policy.js';
import * as apiSecret from '../../modules/merchant-integration/domain/webhook-secret.js';
import * as apiSignature from '../../modules/merchant-integration/domain/webhook-signature.js';

/**
 * The API stores webhook secrets with merchant-integration/domain; the worker
 * decrypts and signs with the copies in @swiftdrop/contracts/node. If either
 * side changes without the other, merchants stop receiving valid webhooks —
 * this test catches that.
 */
describe('webhook crypto: API domain ⇄ shared contracts', () => {
  const key = Buffer.alloc(32, 3);
  const merchantId = '66666666-6666-4666-8666-666666666666';

  it('a secret encrypted by the API decrypts in the worker, and back', () => {
    const secret = apiSecret.generateWebhookSecret();
    expect(
      shared.decryptWebhookSecret(
        apiSecret.encryptWebhookSecret(secret, key, merchantId),
        key,
        merchantId,
      ),
    ).toBe(secret);
    expect(
      apiSecret.decryptWebhookSecret(
        shared.encryptWebhookSecret(secret, key, merchantId),
        key,
        merchantId,
      ),
    ).toBe(secret);
  });

  it('both produce the same signature, and verify each other', () => {
    const secret = 'whsec_compat';
    const timestamp = '1800000000';
    const body = '{"eventId":"e"}';
    const signature = shared.signWebhookPayload(secret, timestamp, body);

    expect(apiSignature.signWebhookPayload(secret, timestamp, body)).toBe(
      signature,
    );
    expect(
      apiSignature.verifyWebhookSignature(secret, timestamp, body, signature, {
        nowSeconds: 1_800_000_000,
      }),
    ).toBe(true);
  });

  it('both retry policies make the same decisions', () => {
    const config = { maxAttempts: 6, backoffBaseMs: 30_000 };
    for (const status of [null, 200, 302, 401, 404, 408, 429, 500, 503]) {
      for (let attempt = 1; attempt <= 6; attempt++) {
        expect(
          retryShared.decideNextWebhookStep(status, attempt, config),
        ).toEqual(apiPolicy.decideNextWebhookStep(status, attempt, config));
      }
    }
  });
});
