import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ParcelsRepository } from './parcels.repository.js';

describe('ParcelsRepository tracking read boundary (isolated Prisma)', () => {
  let findMany: jest.Mock;
  let create: jest.Mock;
  let repository: ParcelsRepository;
  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    create = jest.fn();
    repository = new ParcelsRepository({
      parcel: { findMany, create },
    } as unknown as PrismaService);
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
});
