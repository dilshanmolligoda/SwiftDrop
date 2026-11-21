import { ConsumerName, Queue, type ParcelEventV1 } from '@swiftdrop/contracts';
import {
  attemptOf,
  MAX_PROCESSING_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  planRetry,
  processMessage,
  PROCESSING_ATTEMPT_HEADER,
} from './message-processor.js';
import {
  PermanentFailure,
  type HandleResult,
  type ParcelEventConsumer,
} from './parcel-event-consumer.js';

const EVENT = {
  eventId: '6f1c2c8e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
  eventType: 'parcel.status.changed',
  version: 1,
  occurredAt: '2026-11-21T08:30:00.000Z',
  parcelId: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
  trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
  merchantId: null,
  courierId: null,
  sequence: 3,
  previousStatus: 'IN_TRANSIT',
  newStatus: 'OUT_FOR_DELIVERY',
  failureReason: null,
};

const message = (body: unknown = EVENT) => ({
  content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  delivery: { redelivered: false, headers: {} },
});

function setup() {
  const handle = jest.fn<Promise<HandleResult>, [ParcelEventV1]>(() =>
    Promise.resolve(),
  );
  const consumer: ParcelEventConsumer = {
    queue: Queue.NOTIFICATIONS,
    name: ConsumerName.NOTIFICATIONS,
    handle,
  };
  const store = {
    isProcessed: jest.fn().mockResolvedValue(false),
    markProcessed: jest.fn().mockResolvedValue(undefined),
  };
  return { consumer, handle, store };
}

describe('processMessage', () => {
  it('handles a new event, then marks it processed', async () => {
    const { consumer, handle, store } = setup();

    await expect(processMessage(message(), consumer, store)).resolves.toEqual({
      action: 'ack',
      detail: 'handled',
    });
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT.eventId }),
      { redelivered: false, headers: {} },
    );
    expect(store.markProcessed).toHaveBeenCalledWith(
      EVENT.eventId,
      'worker.notifications',
    );
  });

  it('acks a deferred event without marking it processed', async () => {
    const { consumer, handle, store } = setup();
    handle.mockResolvedValue('deferred');

    await expect(processMessage(message(), consumer, store)).resolves.toEqual({
      action: 'ack',
      detail: 'deferred',
    });
    expect(store.markProcessed).not.toHaveBeenCalled();
  });

  it('acknowledges a duplicate without handling it again', async () => {
    const { consumer, handle, store } = setup();
    store.isProcessed.mockResolvedValue(true);

    await expect(processMessage(message(), consumer, store)).resolves.toEqual({
      action: 'ack',
      detail: 'duplicate',
    });
    expect(handle).not.toHaveBeenCalled();
    expect(store.markProcessed).not.toHaveBeenCalled();
  });

  it.each([
    ['non-JSON', '{oops'],
    ['an unknown version', { ...EVENT, version: 9 }],
    ['a missing eventId', { ...EVENT, eventId: undefined }],
  ])('dead-letters %s without touching the store', async (_name, body) => {
    const { consumer, handle, store } = setup();
    const outcome = await processMessage(message(body), consumer, store);
    expect(outcome.action).toBe('dead-letter');
    expect(handle).not.toHaveBeenCalled();
    expect(store.isProcessed).not.toHaveBeenCalled();
  });

  it('retries a temporary failure and does not mark the event processed', async () => {
    const { consumer, handle, store } = setup();
    handle.mockRejectedValue(new Error('SMTP timeout'));

    await expect(processMessage(message(), consumer, store)).resolves.toEqual({
      action: 'retry',
      reason: 'SMTP timeout',
    });
    expect(store.markProcessed).not.toHaveBeenCalled();
  });

  it('dead-letters a permanent failure', async () => {
    const { consumer, handle, store } = setup();
    handle.mockRejectedValue(new PermanentFailure('parcel not found'));

    await expect(processMessage(message(), consumer, store)).resolves.toEqual({
      action: 'dead-letter',
      reason: 'parcel not found',
    });
  });

  it('retries when the database is unavailable for the duplicate check', async () => {
    const { consumer, handle, store } = setup();
    store.isProcessed.mockRejectedValue(new Error('connection refused'));

    const outcome = await processMessage(message(), consumer, store);
    expect(outcome.action).toBe('retry');
    expect(handle).not.toHaveBeenCalled();
  });

  it('retries when marking fails after the work (handlers are idempotent)', async () => {
    const { consumer, store } = setup();
    store.markProcessed.mockRejectedValue(new Error('connection reset'));

    const outcome = await processMessage(message(), consumer, store);
    expect(outcome.action).toBe('retry');
  });
});

describe('planRetry', () => {
  it('doubles the wait from the base delay on each attempt', () => {
    expect(planRetry(1, 5000)).toEqual({
      action: 'republish',
      delayMs: 5000,
      nextAttempt: 2,
    });
    expect(planRetry(2, 5000)).toMatchObject({ delayMs: 10_000 });
    expect(planRetry(4, 5000)).toMatchObject({ delayMs: 40_000 });
  });

  it('caps the wait at five minutes', () => {
    expect(planRetry(9, 5000)).toMatchObject({ delayMs: MAX_RETRY_DELAY_MS });
  });

  it('dead-letters once the attempt limit is reached', () => {
    expect(planRetry(MAX_PROCESSING_ATTEMPTS, 5000)).toEqual({
      action: 'dead-letter',
      attempts: MAX_PROCESSING_ATTEMPTS,
    });
  });

  it('rides out roughly 20 minutes of failures before dead-lettering', () => {
    let total = 0;
    for (let attempt = 1; attempt < MAX_PROCESSING_ATTEMPTS; attempt++) {
      const plan = planRetry(attempt, 5000);
      if (plan.action === 'republish') total += plan.delayMs;
    }
    expect(total).toBeGreaterThan(15 * 60_000);
  });
});

describe('attemptOf', () => {
  it('reads the attempt header and defaults to 1', () => {
    expect(attemptOf({})).toBe(1);
    expect(attemptOf({ [PROCESSING_ATTEMPT_HEADER]: 4 })).toBe(4);
    expect(attemptOf({ [PROCESSING_ATTEMPT_HEADER]: '4' })).toBe(1);
    expect(attemptOf({ [PROCESSING_ATTEMPT_HEADER]: 0 })).toBe(1);
  });
});

describe('error reasons', () => {
  it('uses the first non-empty line of a multi-line error', async () => {
    const { consumer, handle, store } = setup();
    handle.mockRejectedValue(
      new Error('\n  Invalid `prisma.x()` invocation:\n\n  Connection refused'),
    );
    await expect(processMessage(message(), consumer, store)).resolves.toEqual({
      action: 'retry',
      reason: 'Invalid `prisma.x()` invocation:',
    });
  });

  it('uses the first inner error of an empty AggregateError', async () => {
    const { consumer, handle, store } = setup();
    handle.mockRejectedValue(
      new AggregateError([
        new Error('connect ECONNREFUSED 127.0.0.1:1025'),
        new Error('connect ECONNREFUSED ::1:1025'),
      ]),
    );
    await expect(processMessage(message(), consumer, store)).resolves.toEqual({
      action: 'retry',
      reason: 'connect ECONNREFUSED 127.0.0.1:1025',
    });
  });
});
