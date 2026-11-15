import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { verifySwiftDropSignature } from './signature.js';

const SECRET = 'store-signing-secret';
const NOW = 1_800_000_000;
const TIMESTAMP = String(NOW);
const BODY = '{"eventId":"evt-1","status":"DELIVERED"}';

/** Signs the way SwiftDrop's documentation describes. */
function sign(secret: string, timestamp: string, body: string): string {
  return (
    'sha256=' +
    createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  );
}

describe('verifySwiftDropSignature', () => {
  const signature = sign(SECRET, TIMESTAMP, BODY);

  it('accepts a correctly signed, fresh webhook', () => {
    assert.equal(
      verifySwiftDropSignature(SECRET, TIMESTAMP, BODY, signature, NOW + 5),
      true,
    );
  });

  it('rejects a changed body', () => {
    const changed = BODY.replace('DELIVERED', 'FAILED');
    assert.equal(
      verifySwiftDropSignature(SECRET, TIMESTAMP, changed, signature, NOW),
      false,
    );
  });

  it('rejects a webhook signed with another secret', () => {
    assert.equal(
      verifySwiftDropSignature('wrong-secret', TIMESTAMP, BODY, signature, NOW),
      false,
    );
  });

  it('rejects a webhook older than five minutes', () => {
    assert.equal(
      verifySwiftDropSignature(SECRET, TIMESTAMP, BODY, signature, NOW + 301),
      false,
    );
  });

  it('rejects missing headers and an unset secret', () => {
    assert.equal(
      verifySwiftDropSignature(SECRET, undefined, BODY, signature, NOW),
      false,
    );
    assert.equal(
      verifySwiftDropSignature(SECRET, TIMESTAMP, BODY, undefined, NOW),
      false,
    );
    assert.equal(
      verifySwiftDropSignature('', TIMESTAMP, BODY, signature, NOW),
      false,
    );
  });
});
