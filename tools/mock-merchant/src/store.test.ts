import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { applyWebhook, parcels } from './store.js';

const webhook = (sequence: number, status: string) => ({
  eventId: `evt-${sequence}`,
  trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
  merchantOrderRef: 'ORDER-42',
  status,
  sequence,
  occurredAt: `2026-11-22T08:0${sequence}:00.000Z`,
});

describe('applyWebhook', () => {
  beforeEach(() => parcels.clear());

  it('applies webhooks in order and keeps the latest status', () => {
    assert.equal(applyWebhook(webhook(1, 'PICKED_UP')), 'ACCEPTED');
    assert.equal(applyWebhook(webhook(2, 'OUT_FOR_DELIVERY')), 'ACCEPTED');
    assert.equal(
      parcels.get('SD-0123456789ABCDEF0123456789ABCDEF')?.status,
      'OUT_FOR_DELIVERY',
    );
  });

  it('ignores a late retry of an older event', () => {
    applyWebhook(webhook(3, 'DELIVERED'));
    assert.equal(applyWebhook(webhook(2, 'OUT_FOR_DELIVERY')), 'STALE');
    assert.equal(
      parcels.get('SD-0123456789ABCDEF0123456789ABCDEF')?.status,
      'DELIVERED',
    );
  });

  it('accepts bodies without a sequence without tracking them', () => {
    assert.equal(applyWebhook({ eventId: 'x' }), 'ACCEPTED');
    assert.equal(parcels.size, 0);
  });
});
