import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ParcelsService } from '../../parcels/parcels.service.js';
import { ParcelStatus } from '../../../generated/prisma/enums.js';
import {
  mapParcelRecord,
  type StoredCustomerParcel,
} from './parcel-record.mapper.js';
import { ParcelsReaderAdapter } from './parcels-reader.adapter.js';

describe('ParcelsReaderAdapter and record mapping', () => {
  // These records exist only in isolated tests, never in the production adapter.
  const fixture = (customerId = 'customer-a'): StoredCustomerParcel => ({
    id: 'parcel-a',
    customerId,
    trackingNumber: 'SD-12345',
    senderAddress: 'Private pickup address',
    recipientAddress: 'Private destination address',
    status: ParcelStatus.RETURNED,
    deliveredAt: null,
    createdAt: new Date('2026-11-01T01:00:00Z'),
    updatedAt: new Date('2026-11-03T01:00:00Z'),
    statusEvents: [],
    statusHistory: [
      {
        id: 'h-2',
        status: ParcelStatus.RETURNED,
        createdAt: new Date('2026-11-03T01:00:00Z'),
      },
      {
        id: 'h-1',
        status: ParcelStatus.PENDING,
        createdAt: new Date('2026-11-01T01:00:00Z'),
      },
    ],
  });
  let adapter: ParcelsReaderAdapter;
  let parcels: jest.Mocked<Pick<ParcelsService, 'listForCustomerTracking'>>;

  beforeEach(async () => {
    parcels = { listForCustomerTracking: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ParcelsReaderAdapter,
        { provide: ParcelsService, useValue: parcels },
      ],
    }).compile();
    adapter = module.get(ParcelsReaderAdapter);
  });

  it('maps real record field names and dates while preserving PENDING and RETURNED', () => {
    const source = Object.assign(fixture(), {
      senderName: 'Private Sender',
      recipientName: 'Private Recipient',
      recipientPhone: 'Private Phone',
      costLkr: 350,
      failureReason: 'Private failure reason',
    });
    const originalHistory = [...source.statusHistory];
    const mapped = mapParcelRecord(source);
    expect(mapped).toEqual({
      id: 'parcel-a',
      customerId: 'customer-a',
      trackingNumber: 'SD-12345',
      status: 'RETURNED',
      origin: source.senderAddress,
      destination: source.recipientAddress,
      createdAt: '2026-11-01T01:00:00.000Z',
      updatedAt: '2026-11-03T01:00:00.000Z',
      history: [
        { status: 'PENDING', occurredAt: '2026-11-01T01:00:00.000Z' },
        { status: 'RETURNED', occurredAt: '2026-11-03T01:00:00.000Z' },
      ],
    });
    expect(mapped).not.toHaveProperty('deliveredAt');
    expect(source.statusHistory).toEqual(originalHistory);
    expect(JSON.stringify(mapped)).not.toMatch(
      /Private Sender|Private Recipient|Private Phone|Private note|Private failure|precise location|costLkr/,
    );
  });

  it.each([ParcelStatus.CREATED, ParcelStatus.ASSIGNED])(
    'preserves %s and its actual event without inferring pickup',
    (status) => {
      const source = fixture();
      const event = { ...source.statusHistory[0], status };
      const mapped = mapParcelRecord({
        ...source,
        status,
        statusHistory: [event],
      });
      expect(mapped.status).toBe(status);
      expect(mapped.history).toEqual([
        { status, occurredAt: event.createdAt.toISOString() },
      ]);
      expect(mapped).not.toHaveProperty('deliveredAt');
    },
  );

  it.each([ParcelStatus.CREATED, ParcelStatus.ASSIGNED])(
    'does not manufacture a %s event from a current status alone',
    (status) => {
      expect(
        mapParcelRecord({ ...fixture(), status, statusHistory: [] }).history,
      ).toEqual([]);
    },
  );

  it('maps a confirmed delivered timestamp and never creates inferred events', () => {
    const mapped = mapParcelRecord({
      ...fixture(),
      status: ParcelStatus.DELIVERED,
      deliveredAt: new Date('2026-11-03T01:00:00Z'),
      statusHistory: [],
    });
    expect(mapped.deliveredAt).toBe('2026-11-03T01:00:00.000Z');
    expect(mapped.history).toEqual([]);
  });

  it('merges booking and courier history, coalesces mirrors, and projects a recorded delivery date', () => {
    const source = fixture();
    const timestamp = new Date('2026-11-03T01:00:00Z');
    const delivered = Object.assign(
      {
        id: 'courier-delivered',
        status: ParcelStatus.DELIVERED,
        createdAt: timestamp,
      },
      {
        note: 'Private note',
        actorId: 'Private courier',
        proofId: 'Private proof',
      },
    );
    const mapped = mapParcelRecord({
      ...source,
      status: ParcelStatus.DELIVERED,
      statusHistory: [
        {
          id: 'booking',
          status: ParcelStatus.PENDING,
          createdAt: source.createdAt,
        },
        { id: 'mirror', status: ParcelStatus.DELIVERED, createdAt: timestamp },
      ],
      statusEvents: [
        delivered,
        {
          id: 'assignment',
          status: ParcelStatus.ASSIGNED,
          createdAt: new Date('2026-11-01T02:00:00Z'),
        },
        {
          id: 'pickup',
          status: ParcelStatus.PICKED_UP,
          createdAt: new Date('2026-11-02T01:00:00Z'),
        },
        {
          id: 'transit',
          status: ParcelStatus.IN_TRANSIT,
          createdAt: new Date('2026-11-02T02:00:00Z'),
        },
      ],
    });
    expect(mapped.history.map((event) => event.status)).toEqual([
      'PENDING',
      'ASSIGNED',
      'PICKED_UP',
      'IN_TRANSIT',
      'DELIVERED',
    ]);
    expect(mapped.deliveredAt).toBe(timestamp.toISOString());
    expect(JSON.stringify(mapped)).not.toMatch(
      /Private note|Private courier|Private proof/,
    );
    expect(source.deliveredAt).toBeNull();
  });

  it('prefers an explicit delivery date and otherwise the latest genuine courier delivery event', () => {
    const source = {
      ...fixture(),
      status: ParcelStatus.DELIVERED,
      statusHistory: [],
      statusEvents: [
        {
          id: 'older',
          status: ParcelStatus.DELIVERED,
          createdAt: new Date('2026-10-31T23:59:59.999Z'),
        },
        {
          id: 'latest',
          status: ParcelStatus.DELIVERED,
          createdAt: new Date('2026-11-01T00:00:00Z'),
        },
      ],
    };
    expect(mapParcelRecord(source).deliveredAt).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(
      mapParcelRecord({
        ...source,
        deliveredAt: new Date('2026-10-31T23:59:59.999Z'),
      }).deliveredAt,
    ).toBe('2026-10-31T23:59:59.999Z');
  });

  it.each([ParcelStatus.ASSIGNED, ParcelStatus.FAILED, ParcelStatus.RETURNED])(
    'does not project a completion date from an old delivery event while current status is %s',
    (status) => {
      const mapped = mapParcelRecord({
        ...fixture(),
        status,
        statusEvents: [
          {
            id: 'previous-delivery',
            status: ParcelStatus.DELIVERED,
            createdAt: new Date('2026-11-01T00:00:00Z'),
          },
        ],
      });
      expect(mapped).not.toHaveProperty('deliveredAt');
    },
  );

  it('does not invent a delivery timestamp from updatedAt or booking history alone', () => {
    const mapped = mapParcelRecord({
      ...fixture(),
      status: ParcelStatus.DELIVERED,
      statusHistory: [
        {
          id: 'legacy',
          status: ParcelStatus.DELIVERED,
          createdAt: new Date('2026-11-01T00:00:00Z'),
        },
      ],
      statusEvents: [],
    });
    expect(mapped).not.toHaveProperty('deliveredAt');
    expect(mapped.history).toHaveLength(1);
  });

  it('orders history ties by stable ID without changing the source', () => {
    const source = fixture();
    const time = new Date('2026-11-01T01:00:00Z');
    const mapped = mapParcelRecord({
      ...source,
      statusHistory: [
        { ...source.statusHistory[0], id: 'b', createdAt: time },
        { ...source.statusHistory[1], id: 'a', createdAt: time },
      ],
    });
    expect(mapped.history.map(({ status }) => status)).toEqual([
      'PENDING',
      'RETURNED',
    ]);
  });

  it('rejects missing history instead of silently reporting an empty history', () => {
    expect(() =>
      mapParcelRecord({
        ...fixture(),
        statusHistory: undefined,
      } as unknown as StoredCustomerParcel),
    ).toThrow(InternalServerErrorException);
  });

  it('requires the courier event inclusion instead of silently hiding persisted updates', () => {
    expect(() =>
      mapParcelRecord({
        ...fixture(),
        statusEvents: undefined,
      } as unknown as StoredCustomerParcel),
    ).toThrow(InternalServerErrorException);
  });

  it.each(['createdAt', 'updatedAt', 'deliveredAt'] as const)(
    'rejects invalid %s without inventing a timestamp',
    (field) => {
      expect(() =>
        mapParcelRecord({ ...fixture(), [field]: new Date('invalid') }),
      ).toThrow(InternalServerErrorException);
    },
  );

  it('rejects invalid recorded event timestamps', () => {
    const source = fixture();
    expect(() =>
      mapParcelRecord({
        ...source,
        statusHistory: [
          { ...source.statusHistory[0], createdAt: new Date('invalid') },
        ],
      }),
    ).toThrow(InternalServerErrorException);
  });

  it('looks up a normalized tracking number only within the supplied customer scope', async () => {
    parcels.listForCustomerTracking.mockResolvedValue([fixture()]);
    const result = await adapter.findCustomerParcel('customer-a', ' sd-12345 ');
    expect(parcels.listForCustomerTracking.mock.calls).toEqual([
      ['customer-a'],
    ]);
    expect(result?.trackingNumber).toBe('SD-12345');
    expect(result?.customerId).toBe('customer-a');
  });

  it('returns null for missing and other-owned records even if the upstream contract is broken', async () => {
    parcels.listForCustomerTracking.mockResolvedValue([fixture('customer-b')]);
    await expect(
      adapter.findCustomerParcel('customer-a', 'SD-12345'),
    ).resolves.toBeNull();
    parcels.listForCustomerTracking.mockResolvedValue([]);
    await expect(
      adapter.findCustomerParcel('customer-a', 'SD-12345'),
    ).resolves.toBeNull();
  });

  it('lists complete owned snapshots and fails closed on mixed owners', async () => {
    parcels.listForCustomerTracking.mockResolvedValue([fixture()]);
    await expect(
      adapter.listCustomerParcels('customer-a'),
    ).resolves.toHaveLength(1);
    parcels.listForCustomerTracking.mockResolvedValue([
      fixture(),
      fixture('customer-b'),
    ]);
    await expect(
      adapter.listCustomerParcels('customer-a'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('returns a real empty snapshot and propagates storage failures', async () => {
    parcels.listForCustomerTracking.mockResolvedValue([]);
    await expect(adapter.listCustomerParcels('customer-a')).resolves.toEqual(
      [],
    );
    const failure = new Error('Storage unavailable');
    parcels.listForCustomerTracking.mockRejectedValue(failure);
    await expect(adapter.listCustomerParcels('customer-a')).rejects.toBe(
      failure,
    );
    await expect(
      adapter.findCustomerParcel('customer-a', 'SD-12345'),
    ).rejects.toBe(failure);
  });

  it('rejects invalid tracking numbers before accessing the exported parcel service', async () => {
    await expect(
      adapter.findCustomerParcel('customer-a', '../bad'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(parcels.listForCustomerTracking.mock.calls).toHaveLength(0);
  });
});
