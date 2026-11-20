import { ParcelStatus } from '../../../generated/prisma/enums.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PublicParcelReaderAdapter } from './public-parcel-reader.adapter.js';

describe('PublicParcelReaderAdapter (isolated Prisma)', () => {
  const number = 'SD-0123456789ABCDEFFEDCBA9876543210';
  const time = new Date('2026-11-01T00:00:00Z');
  const fixture = () => ({
    trackingNumber: number,
    status: ParcelStatus.IN_TRANSIT,
    updatedAt: time,
    statusHistory: [{ status: ParcelStatus.PENDING, createdAt: time }],
    statusEvents: [
      {
        status: ParcelStatus.IN_TRANSIT,
        createdAt: new Date('2026-11-02T00:00:00Z'),
      },
    ],
  });
  let findUnique: jest.Mock;
  let adapter: PublicParcelReaderAdapter;
  beforeEach(() => {
    findUnique = jest.fn();
    adapter = new PublicParcelReaderAdapter({
      parcel: { findUnique },
    } as unknown as PrismaService);
  });

  it('uses an indexed exact lookup selecting only public columns from both event stores', async () => {
    findUnique.mockResolvedValue(fixture());
    const result = await adapter.findPublicParcel(number);
    expect(findUnique.mock.calls).toEqual([
      [
        {
          where: { trackingNumber: number },
          select: {
            trackingNumber: true,
            status: true,
            updatedAt: true,
            statusHistory: {
              select: { status: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
            },
            statusEvents: {
              select: { status: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      ],
    ]);
    expect(result?.history).toEqual([
      { status: 'PENDING', occurredAt: '2026-11-01T00:00:00.000Z' },
      { status: 'IN_TRANSIT', occurredAt: '2026-11-02T00:00:00.000Z' },
    ]);
  });

  it('never projects private columns or nested actor, proof, location, or note fields', async () => {
    const source = fixture();
    findUnique.mockResolvedValue({
      ...source,
      id: 'PRIVATE',
      customerId: 'PRIVATE',
      senderName: 'PRIVATE',
      recipientAddress: 'PRIVATE',
      costLkr: 500,
      statusEvents: [
        {
          ...source.statusEvents[0],
          note: 'PRIVATE',
          actor: 'PRIVATE',
          proofId: 'PRIVATE',
        },
      ],
    });
    expect(await adapter.findPublicParcel(number)).toEqual({
      trackingNumber: number,
      status: 'IN_TRANSIT',
      updatedAt: time.toISOString(),
      history: [
        { status: 'PENDING', occurredAt: time.toISOString() },
        { status: 'IN_TRANSIT', occurredAt: '2026-11-02T00:00:00.000Z' },
      ],
    });
  });

  it.each(Object.values(ParcelStatus))(
    'preserves %s without inventing history',
    async (status) => {
      findUnique.mockResolvedValue({
        ...fixture(),
        status,
        statusHistory: [],
        statusEvents: [],
      });
      expect(await adapter.findPublicParcel(number)).toMatchObject({
        status,
        history: [],
      });
    },
  );

  it('chronologically merges sources and retains genuine repeated events', async () => {
    findUnique.mockResolvedValue({
      ...fixture(),
      statusHistory: [
        { status: 'PENDING', createdAt: new Date('2026-11-03T00:00:00Z') },
      ],
      statusEvents: [
        { status: 'CREATED', createdAt: time },
        { status: 'ASSIGNED', createdAt: time },
        { status: 'ASSIGNED', createdAt: time },
      ],
    });
    const result = await adapter.findPublicParcel(number);
    expect(result?.history.map((event) => event.status)).toEqual([
      'CREATED',
      'ASSIGNED',
      'ASSIGNED',
      'PENDING',
    ]);
  });

  it('returns null for missing parcels and never queries legacy identifiers', async () => {
    expect(await adapter.findPublicParcel('SD-21011')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    findUnique.mockResolvedValue(null);
    expect(await adapter.findPublicParcel(number)).toBeNull();
  });

  it('propagates persistence failures rather than supplying fake results', async () => {
    findUnique.mockRejectedValue(new Error('unavailable'));
    await expect(adapter.findPublicParcel(number)).rejects.toThrow(
      'unavailable',
    );
  });
});
