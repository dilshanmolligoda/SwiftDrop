/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Jest mock call arguments are typed `any` */
import {
  DeliveryFailureReason as ContractFailureReason,
  ParcelStatus as ContractParcelStatus,
  Role as ContractRole,
  parseParcelEvent,
} from '@swiftdrop/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  DeliveryFailureReason,
  ParcelStatus,
  Role,
} from '../../generated/prisma/enums.js';
import { OutboxWriter } from './outbox.writer.js';

const PARCEL_ID = '22222222-2222-4222-8222-222222222222';
const COURIER_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '55555555-5555-4555-8555-555555555555';
const MERCHANT_ID = '66666666-6666-4666-8666-666666666666';
const TRACKING = 'SD-0123456789ABCDEF0123456789ABCDEF';

function fakeTx() {
  const tx = {
    outboxEvent: { create: jest.fn().mockResolvedValue({}) },
    merchantOrder: { findUnique: jest.fn() },
  };
  return { tx, client: tx as unknown as Prisma.TransactionClient };
}

/** What the relay will publish: stored payload + row ID + sequence. */
function publishedFrom(tx: ReturnType<typeof fakeTx>['tx'], sequence = 1) {
  const { data } = tx.outboxEvent.create.mock.calls[0][0] as {
    data: { id: string; payload: Record<string, unknown> };
  };
  return parseParcelEvent({ ...data.payload, eventId: data.id, sequence });
}

describe('OutboxWriter', () => {
  const writer = new OutboxWriter();

  it('writes a status-changed event that the relay can publish', async () => {
    const { tx, client } = fakeTx();

    const eventId = await writer.recordParcelStatusChanged(client, {
      parcel: { id: PARCEL_ID, trackingNumber: TRACKING },
      previousStatus: ParcelStatus.ASSIGNED,
      newStatus: ParcelStatus.PICKED_UP,
      courierId: COURIER_ID,
    });

    const { data } = tx.outboxEvent.create.mock.calls[0][0];
    expect(data).toMatchObject({
      id: eventId,
      aggregateType: 'parcel',
      aggregateId: PARCEL_ID,
      eventType: 'parcel.status.changed',
      routingKey: 'parcel.status.changed',
    });
    expect(data.payload).not.toHaveProperty('sequence');

    const event = publishedFrom(tx);
    expect(event).toEqual({
      ok: true,
      value: expect.objectContaining({
        eventId,
        parcelId: PARCEL_ID,
        trackingNumber: TRACKING,
        merchantId: null,
        courierId: COURIER_ID,
        previousStatus: 'ASSIGNED',
        newStatus: 'PICKED_UP',
        failureReason: null,
      }),
    });
    expect(tx.merchantOrder.findUnique).not.toHaveBeenCalled();
  });

  it('keeps the failure reason only for FAILED', async () => {
    const failed = fakeTx();
    await writer.recordParcelStatusChanged(failed.client, {
      parcel: { id: PARCEL_ID, trackingNumber: TRACKING },
      previousStatus: ParcelStatus.OUT_FOR_DELIVERY,
      newStatus: ParcelStatus.FAILED,
      failureReason: DeliveryFailureReason.RECIPIENT_UNAVAILABLE,
    });
    const failedEvent = publishedFrom(failed.tx);
    expect(failedEvent.ok && failedEvent.value).toMatchObject({
      failureReason: 'RECIPIENT_UNAVAILABLE',
    });

    const delivered = fakeTx();
    await writer.recordParcelStatusChanged(delivered.client, {
      parcel: { id: PARCEL_ID, trackingNumber: TRACKING },
      previousStatus: ParcelStatus.OUT_FOR_DELIVERY,
      newStatus: ParcelStatus.DELIVERED,
      failureReason: DeliveryFailureReason.OTHER,
    });
    const deliveredEvent = publishedFrom(delivered.tx);
    expect(deliveredEvent.ok && deliveredEvent.value).toMatchObject({
      failureReason: null,
    });
  });

  it('resolves the merchant through the linked merchant order, in the same transaction', async () => {
    const { tx, client } = fakeTx();
    tx.merchantOrder.findUnique.mockResolvedValue({
      merchantUserId: MERCHANT_ID,
    });

    await writer.recordParcelCreated(client, {
      parcel: {
        id: PARCEL_ID,
        trackingNumber: TRACKING,
        merchantOrderId: ORDER_ID,
      },
      status: ParcelStatus.PENDING,
    });

    expect(tx.merchantOrder.findUnique).toHaveBeenCalledWith({
      where: { id: ORDER_ID },
      select: { merchantUserId: true },
    });
    const event = publishedFrom(tx);
    expect(event.ok && event.value).toMatchObject({
      eventType: 'parcel.created',
      status: 'PENDING',
      merchantId: MERCHANT_ID,
      courierId: null,
    });
  });

  it('never stores personal data in the event', async () => {
    const { tx, client } = fakeTx();
    const parcelRow = {
      id: PARCEL_ID,
      trackingNumber: TRACKING,
      recipientName: 'Jane Perera',
      recipientPhone: '+94770000000',
      recipientAddress: '1 Main St',
    };
    await writer.recordParcelStatusChanged(client, {
      parcel: parcelRow,
      previousStatus: ParcelStatus.ASSIGNED,
      newStatus: ParcelStatus.PICKED_UP,
    });
    const stored = JSON.stringify(
      tx.outboxEvent.create.mock.calls[0][0].data.payload,
    );
    expect(stored).not.toMatch(/Jane|\+9477|Main St/);
  });
});

describe('contracts enums match the Prisma schema', () => {
  const sorted = (o: object) => Object.values(o).sort();

  it.each([
    ['ParcelStatus', ParcelStatus, ContractParcelStatus],
    ['DeliveryFailureReason', DeliveryFailureReason, ContractFailureReason],
    ['Role', Role, ContractRole],
  ])('%s', (_name, prismaEnum, contractEnum) => {
    expect(sorted(contractEnum)).toEqual(sorted(prismaEnum));
  });
});
