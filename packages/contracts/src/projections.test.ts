import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ParcelCreatedV1,
  ParcelStatusChangedV1,
} from './events/parcel-events.js';
import {
  realtimeQueue,
  webhookRetryQueue,
  webhookRetryQueueDeclaration,
} from './messaging/topology.js';
import {
  isNewerUpdate,
  toPublicRealtimeParcelUpdate,
  toRealtimeParcelUpdate,
} from './realtime/realtime.js';
import { toMerchantWebhookPayload } from './webhooks/merchant-webhook.js';

const failed: ParcelStatusChangedV1 = {
  eventId: '6f1c2c8e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
  eventType: 'parcel.status.changed',
  version: 1,
  occurredAt: '2026-11-21T08:30:00.000Z',
  parcelId: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
  trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
  merchantId: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
  courierId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  sequence: 5,
  previousStatus: 'OUT_FOR_DELIVERY',
  newStatus: 'FAILED',
  failureReason: 'RECIPIENT_UNAVAILABLE',
};

const created: ParcelCreatedV1 = {
  eventId: '7a1c2c8e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
  eventType: 'parcel.created',
  version: 1,
  occurredAt: '2026-11-20T08:30:00.000Z',
  parcelId: failed.parcelId,
  trackingNumber: failed.trackingNumber,
  merchantId: failed.merchantId,
  courierId: null,
  sequence: 1,
  status: 'PENDING',
};

describe('toMerchantWebhookPayload', () => {
  it('maps a status change', () => {
    assert.deepEqual(toMerchantWebhookPayload(failed, 'ORDER-42'), {
      eventId: failed.eventId,
      eventType: 'parcel.status.changed',
      version: 1,
      occurredAt: failed.occurredAt,
      trackingNumber: failed.trackingNumber,
      merchantOrderRef: 'ORDER-42',
      status: 'FAILED',
      previousStatus: 'OUT_FOR_DELIVERY',
      failureReason: 'RECIPIENT_UNAVAILABLE',
      sequence: 5,
    });
  });

  it('maps a creation with no previous status', () => {
    const payload = toMerchantWebhookPayload(created, null);
    assert.equal(payload.status, 'PENDING');
    assert.equal(payload.previousStatus, null);
    assert.equal(payload.failureReason, null);
  });

  it('does not expose internal IDs to the merchant', () => {
    const keys = Object.keys(toMerchantWebhookPayload(failed, null));
    for (const internal of ['parcelId', 'merchantId', 'courierId']) {
      assert.equal(keys.includes(internal), false, internal);
    }
  });
});

describe('real-time projections', () => {
  it('private update carries the parcel ID and statuses', () => {
    const update = toRealtimeParcelUpdate(failed);
    assert.equal(update.parcelId, failed.parcelId);
    assert.equal(update.status, 'FAILED');
    assert.equal(update.previousStatus, 'OUT_FOR_DELIVERY');
  });

  it('public update contains only public fields', () => {
    assert.deepEqual(Object.keys(toPublicRealtimeParcelUpdate(failed)).sort(), [
      'occurredAt',
      'sequence',
      'status',
      'trackingNumber',
      'version',
    ]);
  });

  it('isNewerUpdate drops stale and repeated updates', () => {
    assert.equal(isNewerUpdate(null, { sequence: 1 }), true);
    assert.equal(isNewerUpdate({ sequence: 4 }, { sequence: 5 }), true);
    assert.equal(isNewerUpdate({ sequence: 5 }, { sequence: 5 }), false);
    assert.equal(isNewerUpdate({ sequence: 6 }, { sequence: 5 }), false);
  });
});

describe('queue names', () => {
  it('builds retry and realtime queue names', () => {
    assert.equal(webhookRetryQueue(30000), 'webhooks.retry.30000ms');
    const declaration = webhookRetryQueueDeclaration(30000);
    assert.equal(declaration.options.arguments['x-message-ttl'], 30000);
    assert.equal(
      declaration.options.arguments['x-dead-letter-routing-key'],
      'webhooks.parcel-status',
    );
    assert.equal(realtimeQueue('api-1'), 'realtime.api-1');
  });

  it('rejects invalid input', () => {
    assert.throws(() => webhookRetryQueue(0));
    assert.throws(() => realtimeQueue('has space'));
    assert.throws(() => realtimeQueue(''));
  });
});

describe('parcelEventsTopology', () => {
  it('binds both work queues to the exchange and dead-letters to their DLQ', async () => {
    const { parcelEventsTopology, Queue } =
      await import('./messaging/topology.js');
    const topology = parcelEventsTopology('custom.events');
    assert.deepEqual(
      topology.exchanges.map((e) => e.name),
      ['custom.events'],
    );
    const byName = new Map(topology.queues.map((q) => [q.name, q]));
    for (const [work, dlq] of [
      [Queue.NOTIFICATIONS, Queue.NOTIFICATIONS_DEAD_LETTER],
      [Queue.WEBHOOKS, Queue.WEBHOOKS_DEAD_LETTER],
    ] as const) {
      const queue = byName.get(work);
      assert.ok(queue, work);
      assert.equal(queue.options.durable, true);
      assert.equal(queue.options.arguments['x-dead-letter-routing-key'], dlq);
      assert.deepEqual(queue.bindings, [
        { exchange: 'custom.events', pattern: 'parcel.#' },
      ]);
      assert.deepEqual(byName.get(dlq)?.bindings, []);
    }
  });
});

describe('applyTopology', () => {
  it('declares exchanges before queues and binds each queue', async () => {
    const { applyTopology, parcelEventsTopology } =
      await import('./messaging/topology.js');
    const calls: string[] = [];
    await applyTopology(
      {
        assertExchange: async (name) => void calls.push(`exchange ${name}`),
        assertQueue: async (name) => void calls.push(`queue ${name}`),
        bindQueue: async (queue, source, pattern) =>
          void calls.push(`bind ${queue} ${source} ${pattern}`),
      },
      parcelEventsTopology(),
    );
    assert.equal(calls[0], 'exchange parcel.events');
    assert.ok(
      calls.includes('bind webhooks.parcel-status parcel.events parcel.#'),
    );
    assert.equal(calls.filter((c) => c.startsWith('queue ')).length, 4);
  });
});
