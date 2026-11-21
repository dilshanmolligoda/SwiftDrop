import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { ReceiptPrismaReader } from './receipt-prisma.reader.js';
import { InvalidReceiptDataError } from './receipt-validation.js';

describe('ReceiptPrismaReader (isolated persistence)', () => {
  const customerId = '6fe21574-bede-432e-b3f3-c602ac493ac9';
  const parcelId = 'b67b09cb-fb7a-4281-aef3-9183f76678c7';
  const booked = new Date('2026-11-01T06:30:00.000Z');
  const fixture = () => ({
    id: parcelId,
    customerId,
    trackingNumber: 'SD-21011',
    createdAt: booked,
    senderName: 'sender@example.test',
    senderAddress: 'Recorded pickup',
    recipientName: 'Recorded recipient',
    recipientAddress: 'Recorded destination',
    recipientPhone: '+94 77 000 0000',
    costLkr: new Prisma.Decimal('650.29'),
    status: 'PENDING',
    deliveredAt: null as Date | null,
  });
  let findFirst: jest.Mock;
  let reader: ReceiptPrismaReader;

  beforeEach(() => {
    findFirst = jest.fn().mockResolvedValue(fixture());
    reader = new ReceiptPrismaReader({
      parcel: { findFirst },
    } as unknown as PrismaService);
  });

  it('enforces ownership in the storage query and selects only recorded receipt fields', async () => {
    const record = await reader.findCustomerReceipt(customerId, parcelId);
    expect(findFirst.mock.calls).toEqual([
      [
        {
          where: { id: parcelId, customerId },
          select: {
            id: true,
            customerId: true,
            trackingNumber: true,
            createdAt: true,
            senderName: true,
            senderAddress: true,
            recipientName: true,
            recipientAddress: true,
            recipientPhone: true,
            costLkr: true,
            status: true,
            deliveredAt: true,
          },
        },
      ],
    ]);
    expect(record).toEqual({
      parcelId,
      customerId,
      receipt: {
        reference: parcelId,
        trackingNumber: 'SD-21011',
        bookedAt: booked.toISOString(),
        sender: { name: 'sender@example.test' },
        recipient: { name: 'Recorded recipient', phone: '+94 77 000 0000' },
        pickupAddress: 'Recorded pickup',
        destinationAddress: 'Recorded destination',
        deliveryFeeMinor: 65029,
        currency: 'LKR',
        deliveryStatus: 'PENDING',
      },
    });
  });

  it.each([
    ['0', 0],
    ['0.01', 1],
    ['0.29', 29],
    ['1.1', 110],
    ['650.29', 65029],
    ['99999999.99', 9999999999],
  ])(
    'converts recorded LKR %s exactly to %s cents',
    async (costLkr, expected) => {
      findFirst.mockResolvedValue({
        ...fixture(),
        costLkr: new Prisma.Decimal(costLkr),
      });
      expect(
        (await reader.findCustomerReceipt(customerId, parcelId))?.receipt
          .deliveryFeeMinor,
      ).toBe(expected);
    },
  );

  it.each(['-0.01', '0.001', '100000000', 'NaN', 'Infinity'])(
    'rejects out-of-contract recorded amount %s without rounding',
    async (amount) => {
      findFirst.mockResolvedValue({
        ...fixture(),
        costLkr: new Prisma.Decimal(amount),
      });
      await expect(
        reader.findCustomerReceipt(customerId, parcelId),
      ).rejects.toBeInstanceOf(InvalidReceiptDataError);
    },
  );

  it.each([null, undefined, 650.29, '650.29'])(
    'does not coerce missing or non-Decimal stored charges %p',
    async (costLkr) => {
      findFirst.mockResolvedValue({ ...fixture(), costLkr });
      await expect(
        reader.findCustomerReceipt(customerId, parcelId),
      ).rejects.toBeInstanceOf(InvalidReceiptDataError);
    },
  );

  it.each([
    null,
    { ...fixture(), customerId: 'another-owner', costLkr: null },
    { ...fixture(), id: 'another-parcel', createdAt: null },
  ])(
    'returns null for missing or mismatched ownership before formatting private data',
    async (parcel) => {
      findFirst.mockResolvedValue(parcel);
      await expect(
        reader.findCustomerReceipt(customerId, parcelId),
      ).resolves.toBeNull();
    },
  );

  it.each(['SD-21011', 'SD-0123456789ABCDEFFEDCBA9876543210'])(
    'preserves authenticated legacy or secure number %s',
    async (trackingNumber) => {
      findFirst.mockResolvedValue({ ...fixture(), trackingNumber });
      expect(
        (await reader.findCustomerReceipt(customerId, parcelId))?.receipt
          .trackingNumber,
      ).toBe(trackingNumber);
    },
  );

  it('uses a delivery date only when it is actually persisted', async () => {
    expect(
      (await reader.findCustomerReceipt(customerId, parcelId))?.receipt,
    ).not.toHaveProperty('deliveredAt');
    const deliveredAt = new Date('2026-11-02T00:00:00.000Z');
    findFirst.mockResolvedValue({
      ...fixture(),
      status: 'DELIVERED',
      deliveredAt,
    });
    expect(
      (await reader.findCustomerReceipt(customerId, parcelId))?.receipt
        .deliveredAt,
    ).toBe(deliveredAt.toISOString());
    findFirst.mockResolvedValue({ ...fixture(), status: 'DELIVERED' });
    expect(
      (await reader.findCustomerReceipt(customerId, parcelId))?.receipt,
    ).not.toHaveProperty('deliveredAt');
  });

  it.each(['createdAt', 'deliveredAt'])(
    'rejects invalid recorded %s',
    async (field) => {
      findFirst.mockResolvedValue({
        ...fixture(),
        [field]: new Date('invalid'),
      });
      await expect(
        reader.findCustomerReceipt(customerId, parcelId),
      ).rejects.toBeInstanceOf(InvalidReceiptDataError);
    },
  );

  it('propagates storage errors without providing a fabricated receipt', async () => {
    const failure = new Error('unavailable');
    findFirst.mockRejectedValue(failure);
    await expect(reader.findCustomerReceipt(customerId, parcelId)).rejects.toBe(
      failure,
    );
  });
});
