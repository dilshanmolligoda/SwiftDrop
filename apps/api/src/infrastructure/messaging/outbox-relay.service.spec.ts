/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Jest mock call arguments are typed `any` */
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MessagingConfig } from './messaging.config.js';
import { OutboxRelay, rowBackoffMs } from './outbox-relay.service.js';
import type { RabbitMqPublisher } from './rabbitmq.publisher.js';

const CONFIG: MessagingConfig = {
  enabled: true,
  url: 'amqp://test',
  exchange: 'parcel.events',
  pollIntervalMs: 1000,
  batchSize: 50,
  publishTimeoutMs: 5000,
  instanceId: 'test',
};

function row(n: number, payload: unknown = validPayload(n)) {
  return {
    id: `0000000${n}-1b2a-4c3d-9e8f-0a1b2c3d4e5f`,
    sequence: BigInt(n),
    routingKey: 'parcel.status.changed',
    payload,
    attempts: 0,
  };
}

function validPayload(n: number) {
  return {
    eventId: 'ignored — the row ID wins',
    eventType: 'parcel.status.changed',
    version: 1,
    occurredAt: `2026-11-21T08:3${n}:00.000Z`,
    parcelId: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
    trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
    merchantId: null,
    courierId: null,
    previousStatus: 'IN_TRANSIT',
    newStatus: 'OUT_FOR_DELIVERY',
    failureReason: null,
  };
}

function harness(options: { locked?: boolean; connected?: boolean } = {}) {
  const tx = {
    $queryRaw: jest.fn(),
    outboxEvent: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  tx.$queryRaw.mockResolvedValueOnce([{ locked: options.locked ?? true }]);

  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const publisher = {
    isConnected: jest.fn().mockReturnValue(options.connected ?? true),
    publish: jest.fn().mockResolvedValue(undefined),
    start: jest.fn(),
    close: jest.fn(),
  };
  const relay = new OutboxRelay(
    prisma as unknown as PrismaService,
    publisher as unknown as RabbitMqPublisher,
    CONFIG,
  );
  const givenRows = (...rows: ReturnType<typeof row>[]) =>
    tx.$queryRaw.mockResolvedValueOnce(rows);
  return { relay, tx, prisma, publisher, givenRows };
}

describe('OutboxRelay.publishBatch', () => {
  it('publishes rows in order and marks them published', async () => {
    const { relay, tx, publisher, givenRows } = harness();
    givenRows(row(1), row(2));

    await expect(relay.publishBatch()).resolves.toEqual({
      skipped: false,
      published: 2,
      failed: 0,
    });

    expect(publisher.publish).toHaveBeenCalledTimes(2);
    const [routingKey, body, props] = publisher.publish.mock.calls[0];
    expect(routingKey).toBe('parcel.status.changed');
    const message = JSON.parse((body as Buffer).toString());
    expect(message.eventId).toBe(row(1).id);
    expect(message.sequence).toBe(1);
    expect(props).toMatchObject({
      messageId: row(1).id,
      type: 'parcel.status.changed',
    });
    expect(tx.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [row(1).id, row(2).id] } },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('does nothing while RabbitMQ is disconnected', async () => {
    const { relay, prisma } = harness({ connected: false });
    await expect(relay.publishBatch()).resolves.toMatchObject({
      skipped: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips the pass when another API instance holds the relay lock', async () => {
    const { relay, publisher } = harness({ locked: false });
    await expect(relay.publishBatch()).resolves.toMatchObject({
      skipped: true,
    });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('stops at the first publish failure to keep order, and backs that row off', async () => {
    const { relay, tx, publisher, givenRows } = harness();
    givenRows(row(1), row(2), row(3));
    publisher.publish
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('publish timeout'));

    await expect(relay.publishBatch()).resolves.toEqual({
      skipped: false,
      published: 1,
      failed: 1,
    });

    expect(publisher.publish).toHaveBeenCalledTimes(2); // row 3 not attempted
    expect(tx.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [row(1).id] } },
      data: { publishedAt: expect.any(Date) },
    });
    expect(tx.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: row(2).id },
      data: {
        attempts: { increment: 1 },
        lastError: 'publish timeout',
        nextAttemptAt: expect.any(Date),
      },
    });
  });

  it('sets an invalid row aside without blocking the rows after it', async () => {
    const { relay, tx, publisher, givenRows } = harness();
    givenRows(row(1, { eventType: 'parcel.status.changed' }), row(2));

    await expect(relay.publishBatch()).resolves.toEqual({
      skipped: false,
      published: 1,
      failed: 1,
    });
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    const update = tx.outboxEvent.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: row(1).id });
    expect(update.data.lastError).toMatch(/^Invalid payload/);
    expect(update.data.nextAttemptAt.getTime()).toBeGreaterThan(
      Date.now() + 59 * 60_000,
    );
  });

  it('marks nothing when there is nothing to publish', async () => {
    const { relay, tx, givenRows } = harness();
    givenRows();
    await expect(relay.publishBatch()).resolves.toEqual({
      skipped: false,
      published: 0,
      failed: 0,
    });
    expect(tx.outboxEvent.updateMany).not.toHaveBeenCalled();
  });
});

describe('rowBackoffMs', () => {
  it('doubles from 1s and caps at 5 minutes', () => {
    expect(rowBackoffMs(0)).toBe(1000);
    expect(rowBackoffMs(1)).toBe(2000);
    expect(rowBackoffMs(5)).toBe(32_000);
    expect(rowBackoffMs(20)).toBe(300_000);
  });
});

describe('OutboxRelay lifecycle', () => {
  it('does not connect when messaging is disabled', () => {
    const { publisher, prisma } = harness();
    const relay = new OutboxRelay(
      prisma as unknown as PrismaService,
      publisher as unknown as RabbitMqPublisher,
      { ...CONFIG, enabled: false },
    );
    relay.onApplicationBootstrap();
    expect(publisher.start).not.toHaveBeenCalled();
  });
});
