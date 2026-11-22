import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  generateWebhookSecret,
  isPublicAddress,
  parseEncryptionKey,
  signWebhookPayload,
  verifyWebhookSignature,
} from './node/index.js';
import { checkWebhookUrl } from './webhooks/webhook-url.js';

describe('isPublicAddress', () => {
  const blocked = [
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    'not-an-ip',
    '',
  ];
  for (const address of blocked) {
    it(`blocks ${address || '(empty)'}`, () => {
      assert.equal(isPublicAddress(address), false);
    });
  }

  for (const address of [
    '8.8.8.8',
    '1.1.1.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ]) {
    it(`allows ${address}`, () => {
      assert.equal(isPublicAddress(address), true);
    });
  }
});

describe('checkWebhookUrl', () => {
  it('accepts https, and http only when allowed', () => {
    assert.equal(
      checkWebhookUrl('https://shop.example/hooks', { requireHttps: true }).ok,
      true,
    );
    assert.equal(
      checkWebhookUrl('http://mock-merchant:5000/webhooks/swiftdrop', {
        requireHttps: false,
      }).ok,
      true,
    );
    assert.equal(
      checkWebhookUrl('http://shop.example/hooks', { requireHttps: true }).ok,
      false,
    );
  });

  for (const bad of [
    '',
    'not a url',
    'ftp://shop.example/x',
    'https://user:pass@shop.example/x',
    `https://shop.example/${'a'.repeat(2100)}`,
  ]) {
    it(`rejects ${bad.slice(0, 40) || '(empty)'}`, () => {
      assert.equal(checkWebhookUrl(bad, { requireHttps: false }).ok, false);
    });
  }
});

describe('webhook signing and secrets', () => {
  it('signs so that a merchant can verify, and rejects tampering', () => {
    const secret = generateWebhookSecret();
    const body = '{"eventId":"x"}';
    const now = 1_800_000_000;
    const signature = signWebhookPayload(secret, String(now), body);
    assert.match(signature, /^sha256=[0-9a-f]{64}$/);
    assert.equal(
      verifyWebhookSignature(secret, String(now), body, signature, {
        nowSeconds: now,
      }),
      true,
    );
    assert.equal(
      verifyWebhookSignature(secret, String(now), body + ' ', signature, {
        nowSeconds: now,
      }),
      false,
    );
    assert.equal(
      verifyWebhookSignature(secret, String(now), body, signature, {
        nowSeconds: now + 301,
      }),
      false,
    );
  });

  it('round-trips an encrypted secret bound to its merchant', () => {
    const key = parseEncryptionKey(Buffer.alloc(32, 7).toString('base64'));
    const secret = generateWebhookSecret();
    const stored = encryptWebhookSecret(secret, key, 'merchant-a');
    assert.equal(decryptWebhookSecret(stored, key, 'merchant-a'), secret);
    assert.throws(() => decryptWebhookSecret(stored, key, 'merchant-b'));
  });
});
