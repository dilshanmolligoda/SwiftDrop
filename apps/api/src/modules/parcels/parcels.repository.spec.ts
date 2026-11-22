import { Prisma } from '../../generated/prisma/client.js';
import type { OutboxWriter } from '../../infrastructure/outbox/outbox.writer.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ParcelsRepository } from './parcels.repository.js';

describe('ParcelsRepository tracking read boundary (isolated Prisma)', () => {
  let findMany: jest.Mock;
  let create: jest.Mock;
  let recordParcelCreated: jest.Mock;
  let repository: ParcelsRepository;
  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    create = jest.fn();
    recordParcelCreated = jest.fn().mockResolvedValue('event-id');
    const prisma = { parcel: { findMany, create } };
    repository = new ParcelsRepository(
      {
        ...prisma,
        $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
          fn(prisma),
        ),
      } as unknown as PrismaService,
      { recordParcelCreated } as unknown as OutboxWriter,
    );
  });

  it('reads tracking events only for the authenticated customer, without actor/proof/note fields', async () => {
    await repository.findCustomerTrackingParcels('owner');
    expect(findMany.mock.calls).toEqual([
      [
        {
          where: { customerId: 'owner' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            customerId: true,
            trackingNumber: true,
            status: true,
            senderAddress: true,
            recipientAddress: true,
            createdAt: true,
            updatedAt: true,
            deliveredAt: true,
            statusHistory: {
              select: { id: true, status: true, createdAt: true },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
            statusEvents: {
              select: { id: true, status: true, createdAt: true },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
          },
        },
      ],
    ]);
  });

  it('preserves the existing parcel-list query and does not add courier fields to its HTTP contract', async () => {
    await repository.findCustomerParcels('owner');
    expect(findMany.mock.calls).toEqual([
      [
        {
          where: { customerId: 'owner' },
          orderBy: { createdAt: 'desc' },
          include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
        },
      ],
    ]);
  });

  it('preserves the real booking event created by the existing parcel flow', async () => {
    create.mockResolvedValue({
      weightKg: new Prisma.Decimal(1),
      costLkr: new Prisma.Decimal(350),
    });
    await repository.createParcel({
      trackingNumber: 'SD-0123456789ABCDEFFEDCBA9876543210',
      customerId: 'owner',
      senderName: 'Sender',
      senderAddress: 'Pickup',
      recipientName: 'Recipient',
      recipientAddress: 'Destination',
      recipientPhone: 'Phone',
      packageSize: 'SMALL',
      weightKg: 1,
      costLkr: 350,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0] as unknown).toMatchObject([
      {
        data: {
          customerId: 'owner',
          costLkr: 350,
          status: 'PENDING',
          statusHistory: {
            create: {
              status: 'PENDING',
              note: 'Delivery request created by customer.',
            },
          },
        },
      },
    ]);
  });

  it('records a parcel.created event in the same transaction', async () => {
    const row = {
      id: 'parcel-1',
      trackingNumber: 'SD-0123456789ABCDEFFEDCBA9876543210',
      weightKg: new Prisma.Decimal(1),
      costLkr: new Prisma.Decimal(350),
    };
    create.mockResolvedValue(row);
    await repository.createParcel({
      trackingNumber: row.trackingNumber,
      customerId: 'owner',
      senderName: 'Sender',
      senderAddress: 'Pickup',
      recipientName: 'Recipient',
      recipientAddress: 'Destination',
      recipientPhone: 'Phone',
      packageSize: 'SMALL',
      weightKg: 1,
      costLkr: 350,
    });
    expect(recordParcelCreated).toHaveBeenCalledWith(
      expect.objectContaining({ parcel: { findMany, create } }),
      { parcel: row, status: 'PENDING' },
    );
  });

  it('creates an in-app notification for the customer when notification client is present', async () => {
    const row = {
      id: 'parcel-1',
      trackingNumber: 'SD-CONFIRMED123',
      weightKg: new Prisma.Decimal(1),
      costLkr: new Prisma.Decimal(350),
    };
    create.mockResolvedValue(row);
    const notificationCreate = jest.fn().mockResolvedValue({});
    const customPrisma = {
      parcel: { findMany, create },
      notification: { create: notificationCreate },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          parcel: { findMany, create },
          notification: { create: notificationCreate },
        }),
      ),
    };
    const repo = new ParcelsRepository(
      customPrisma as unknown as PrismaService,
      { recordParcelCreated } as unknown as OutboxWriter,
    );

    await repo.createParcel({
      trackingNumber: row.trackingNumber,
      customerId: 'customer-123',
      senderName: 'Sender',
      senderAddress: 'Pickup',
      recipientName: 'Recipient',
      recipientAddress: 'Destination',
      recipientPhone: 'Phone',
      packageSize: 'SMALL',
      weightKg: 1,
      costLkr: 350,
    });

    expect(notificationCreate).toHaveBeenCalled();
    const callArgs = notificationCreate.mock.calls as Array<
      [
        {
          data: {
            channel: string;
            recipientUserId: string;
            template: string;
            title: string;
            description: string;
            status: string;
          };
        },
      ]
    >;
    expect(callArgs[0][0].data).toMatchObject({
      channel: 'IN_APP',
      recipientUserId: 'customer-123',
      template: 'parcel_created',
      title: 'Delivery created',
      description: 'Your delivery request SD-CONFIRMED123 has been confirmed.',
      status: 'SENT',
    });
  });
});
