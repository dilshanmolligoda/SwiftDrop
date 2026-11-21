import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseParcelEvent } from './parse-parcel-event.js';

const statusChanged = {
  eventId: '6f1c2c8e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
  eventType: 'parcel.status.changed',
  version: 1,
  occurredAt: '2026-11-21T08:30:00.000Z',
  parcelId: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
  trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
  merchantId: null,
  courierId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  sequence: 3,
  previousStatus: 'IN_TRANSIT',
  newStatus: 'OUT_FOR_DELIVERY',
  failureReason: null,
};

describe('parseParcelEvent', () => {
  it('accepts a valid status-changed event', () => {
    const result = parseParcelEvent(statusChanged);
    assert.equal(result.ok, true);
  });

  it('accepts the raw JSON string and bytes as received from RabbitMQ', () => {
    const json = JSON.stringify(statusChanged);
    assert.equal(parseParcelEvent(json).ok, true);
    assert.equal(parseParcelEvent(Buffer.from(json)).ok, true);
  });

  it('accepts a valid created event', () => {
    const { previousStatus, newStatus, failureReason, ...base } = statusChanged;
    void previousStatus;
    void newStatus;
    void failureReason;
    const result = parseParcelEvent({
      ...base,
      eventType: 'parcel.created',
      status: 'PENDING',
    });
    assert.equal(result.ok, true);
  });

  it('drops unknown fields so they cannot travel further', () => {
    const result = parseParcelEvent({
      ...statusChanged,
      recipientPhone: '+94770000000',
    });
    assert.ok(result.ok);
    assert.equal('recipientPhone' in result.value, false);
  });

  it('accepts FAILED with a failure reason', () => {
    const result = parseParcelEvent({
      ...statusChanged,
      previousStatus: 'OUT_FOR_DELIVERY',
      newStatus: 'FAILED',
      failureReason: 'RECIPIENT_UNAVAILABLE',
    });
    assert.equal(result.ok, true);
  });

  const invalid: Array<[string, unknown]> = [
    ['non-JSON text', '{not json'],
    ['an array', []],
    ['null', null],
    ['an unknown version', { ...statusChanged, version: 2 }],
    [
      'an unknown event type',
      { ...statusChanged, eventType: 'parcel.deleted' },
    ],
    ['a non-UUID eventId', { ...statusChanged, eventId: 'abc' }],
    ['a non-UTC time', { ...statusChanged, occurredAt: '2026-11-21 08:30' }],
    ['an empty tracking number', { ...statusChanged, trackingNumber: '' }],
    ['a missing merchantId', { ...statusChanged, merchantId: undefined }],
    ['a zero sequence', { ...statusChanged, sequence: 0 }],
    ['a fractional sequence', { ...statusChanged, sequence: 1.5 }],
    ['an unknown status', { ...statusChanged, newStatus: 'LOST' }],
    [
      'a failure reason on a non-FAILED status',
      { ...statusChanged, failureReason: 'OTHER' },
    ],
    [
      'an unknown failure reason',
      { ...statusChanged, newStatus: 'FAILED', failureReason: 'DOG_ATE_IT' },
    ],
  ];

  for (const [name, input] of invalid) {
    it(`rejects ${name}`, () => {
      const result = parseParcelEvent(input);
      assert.equal(result.ok, false);
    });
  }
});
