import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import type { ParcelReadRecord } from '../domain/parcel.types.js';
import { ParcelReader } from '../ports/parcel-reader.port.js';
import {
  ParcelStatusPolicy,
  type ParcelStatusCategory,
} from '../ports/parcel-status-policy.port.js';
import { DeliveryHistoryService } from './delivery-history.service.js';

describe('DeliveryHistoryService (isolated reader and status policy)', () => {
  const user: AuthenticatedUser = {
    id: 'customer-a',
    email: 'a@example.test',
    role: 'CUSTOMER',
  };
  const now = new Date('2026-11-15T00:00:00Z');
  const record = (
    id: string,
    status = 'BOOKED',
    createdAt = '2026-11-01T00:00:00Z',
  ): ParcelReadRecord => ({
    id,
    customerId: user.id,
    trackingNumber: `TEST-${id.toUpperCase()}`,
    status,
    createdAt,
    destination: 'Private destination',
    history: [],
  });
  // Deliberately test-only vocabulary. No production policy is supplied.
  const categories: Readonly<Record<string, ParcelStatusCategory>> = {
    BOOKED: 'active',
    MOVING: 'active',
    DONE: 'delivered',
    UNDELIVERABLE: 'failed',
    CANCELLED: 'other-terminal',
  };
  let service: DeliveryHistoryService;
  let reader: jest.Mocked<ParcelReader>;
  let policy: jest.Mocked<ParcelStatusPolicy>;

  beforeEach(async () => {
    reader = {
      findPublicParcel: jest.fn(),
      findCustomerParcel: jest.fn(),
      listCustomerParcels: jest.fn().mockResolvedValue([]),
    };
    policy = { classify: jest.fn((status: string) => categories[status]) };
    const module = await Test.createTestingModule({
      providers: [
        DeliveryHistoryService,
        { provide: ParcelReader, useValue: reader },
        { provide: ParcelStatusPolicy, useValue: policy },
      ],
    }).compile();
    service = module.get(DeliveryHistoryService);
  });

  it('returns a confirmed empty page and zero summary for an empty snapshot', async () => {
    await expect(service.listCustomerDeliveries(user)).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 5,
      total: 0,
    });
    await expect(service.getCustomerSummary(user, now)).resolves.toEqual({
      activeDeliveries: 0,
      deliveredThisMonth: 0,
      needsAttention: 0,
      reportingMonth: '2026-11',
      timeZone: 'Asia/Colombo',
    });
    expect(reader.listCustomerParcels.mock.calls).toEqual([
      [user.id],
      [user.id],
    ]);
  });

  it.each([
    ['all', ['a', 'b', 'c', 'd', 'e']],
    ['active', ['a', 'b']],
    ['history', ['c', 'd', 'e']],
  ])(
    'applies the explicitly injected %s classification',
    async (filter, expected) => {
      reader.listCustomerParcels.mockResolvedValue([
        record('e', 'CANCELLED'),
        record('d', 'UNDELIVERABLE'),
        record('c', 'DONE'),
        record('b', 'MOVING'),
        record('a', 'BOOKED'),
      ]);
      const result = await service.listCustomerDeliveries(user, {
        filter,
        pageSize: 100,
      });
      expect(result.items.map(({ id }) => id).sort()).toEqual(expected);
      expect(result.total).toBe(expected.length);
    },
  );

  it('searches only tracking numbers within the selected filter', async () => {
    reader.listCustomerParcels.mockResolvedValue([
      record('abc', 'BOOKED'),
      record('abd', 'DONE'),
      record('xyz', 'MOVING'),
    ]);
    const result = await service.listCustomerDeliveries(user, {
      filter: 'active',
      search: '  test-ab  ',
    });
    expect(result.items.map(({ id }) => id)).toEqual(['abc']);
    await expect(
      service.listCustomerDeliveries(user, { search: 'Private destination' }),
    ).resolves.toMatchObject({ total: 0, items: [] });
    await expect(
      service.listCustomerDeliveries(user, { search: 'no-match' }),
    ).resolves.toMatchObject({ total: 0, items: [] });
  });

  it('filters before paging and preserves total plus the requested out-of-range page', async () => {
    reader.listCustomerParcels.mockResolvedValue(
      Array.from({ length: 16 }, (_, index) =>
        record(String(index).padStart(2, '0')),
      ),
    );
    const first = await service.listCustomerDeliveries(user);
    expect(first.items).toHaveLength(5);
    expect(first.total).toBe(16);
    const last = await service.listCustomerDeliveries(user, {
      page: '4',
      pageSize: '5',
    });
    expect(last.items).toHaveLength(1);
    expect(last.items[0].id).toBe('00');
    await expect(
      service.listCustomerDeliveries(user, { page: 5 }),
    ).resolves.toEqual({ items: [], page: 5, pageSize: 5, total: 16 });
    const filtered = await service.listCustomerDeliveries(user, {
      search: 'TEST-0',
      page: 2,
    });
    expect(filtered.total).toBe(10);
    expect(filtered.items.map(({ id }) => id)).toEqual([
      '04',
      '03',
      '02',
      '01',
      '00',
    ]);
  });

  it('sorts by creation instant then descending ID without mutating the reader snapshot', async () => {
    const parcels = Object.freeze([
      record('a'),
      record('c', 'BOOKED', '2026-10-31T00:00:00Z'),
      record('b'),
    ]);
    reader.listCustomerParcels.mockResolvedValue(parcels);
    const result = await service.listCustomerDeliveries(user);
    expect(result.items.map(({ id }) => id)).toEqual(['b', 'a', 'c']);
    expect(parcels.map(({ id }) => id)).toEqual(['a', 'c', 'b']);
    expect(result.items[0]).not.toHaveProperty('history');
    expect(result.items[0]).not.toHaveProperty('customerId');
  });

  it('counts confirmed delivery timestamps using Colombo month and year boundaries', async () => {
    reader.listCustomerParcels.mockResolvedValue([
      record('active', 'MOVING'),
      record('failed', 'UNDELIVERABLE'),
      record('cancelled', 'CANCELLED'),
      { ...record('nov', 'DONE'), deliveredAt: '2026-10-31T18:30:00Z' },
      { ...record('oct', 'DONE'), deliveredAt: '2026-10-31T18:29:59Z' },
      { ...record('dec', 'DONE'), deliveredAt: '2026-11-30T18:30:00Z' },
      { ...record('last-year', 'DONE'), deliveredAt: '2025-11-15T00:00:00Z' },
    ]);
    await expect(service.getCustomerSummary(user, now)).resolves.toMatchObject({
      activeDeliveries: 1,
      deliveredThisMonth: 1,
      needsAttention: 1,
      reportingMonth: '2026-11',
    });
    await expect(
      service.getCustomerSummary(user, new Date('2026-11-30T18:30:00Z')),
    ).resolves.toMatchObject({
      deliveredThisMonth: 1,
      reportingMonth: '2026-12',
    });
  });

  it.each([undefined, 'invalid'])(
    'returns an unknown monthly count for an unusable delivery date %p',
    async (deliveredAt) => {
      reader.listCustomerParcels.mockResolvedValue([
        { ...record('dated', 'DONE'), deliveredAt: '2026-11-10T00:00:00Z' },
        { ...record('undated', 'DONE'), deliveredAt },
      ]);
      await expect(
        service.getCustomerSummary(user, now),
      ).resolves.toMatchObject({ deliveredThisMonth: null });
    },
  );

  it('does not treat a non-delivered record with a timestamp as delivered', async () => {
    reader.listCustomerParcels.mockResolvedValue([
      {
        ...record('failed', 'UNDELIVERABLE'),
        deliveredAt: '2026-11-10T00:00:00Z',
      },
    ]);
    await expect(service.getCustomerSummary(user, now)).resolves.toMatchObject({
      deliveredThisMonth: 0,
      needsAttention: 1,
    });
  });

  it('fails closed on mixed ownership for both list and summary calls', async () => {
    reader.listCustomerParcels.mockResolvedValue([
      record('own'),
      { ...record('other'), customerId: 'other-user' },
    ]);
    await expect(service.listCustomerDeliveries(user)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(service.getCustomerSummary(user, now)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('fails rather than inventing a classification for unmapped status codes', async () => {
    reader.listCustomerParcels.mockResolvedValue([record('a', 'UNMAPPED')]);
    await expect(service.listCustomerDeliveries(user)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.getCustomerSummary(user, now)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects malformed stored creation dates and invalid reporting clocks', async () => {
    reader.listCustomerParcels.mockResolvedValue([
      record('a', 'BOOKED', 'invalid'),
    ]);
    await expect(service.listCustomerDeliveries(user)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(
      service.getCustomerSummary(user, new Date('invalid')),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it.each([null, undefined])(
    'requires an authenticated identity before accessing the reader',
    async (identity) => {
      await expect(
        service.listCustomerDeliveries(identity),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.getCustomerSummary(identity, now),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(reader.listCustomerParcels.mock.calls).toHaveLength(0);
    },
  );

  it('rejects non-customers and invalid queries without accessing storage', async () => {
    await expect(
      service.listCustomerDeliveries({ ...user, role: 'MERCHANT' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getCustomerSummary({ ...user, role: 'COURIER' }, now),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.listCustomerDeliveries(user, { customerId: 'other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.listCustomerDeliveries(user, { pageSize: 1000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reader.listCustomerParcels.mock.calls).toHaveLength(0);
  });

  it('propagates storage failures instead of reporting a confirmed empty account', async () => {
    const failure = new Error('Reader unavailable');
    reader.listCustomerParcels.mockRejectedValue(failure);
    await expect(service.listCustomerDeliveries(user)).rejects.toBe(failure);
    await expect(service.getCustomerSummary(user, now)).rejects.toBe(failure);
  });
});
