import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import type { ParcelReadRecord } from '../domain/parcel.types.js';
import { ParcelReader } from '../ports/parcel-reader.port.js';
import { TrackingService } from './tracking.service.js';

describe('TrackingService (isolated reader)', () => {
  const user: AuthenticatedUser = {
    id: 'customer-a',
    email: 'customer@example.test',
    role: 'CUSTOMER',
  };
  // Test fixture only. BOOKED is deliberately not a production status mapping.
  const record = (): ParcelReadRecord => ({
    id: 'parcel-a',
    customerId: user.id,
    trackingNumber: 'TEST-123',
    status: 'BOOKED',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
    origin: 'Full private pickup address',
    destination: 'Full private recipient address',
    history: [
      {
        status: 'BOOKED',
        occurredAt: '2026-11-01T00:00:00Z',
        internalNote: 'Internal dispatch note',
      },
    ],
  });
  let service: TrackingService;
  let reader: jest.Mocked<ParcelReader>;

  beforeEach(async () => {
    reader = {
      findPublicParcel: jest.fn(),
      findCustomerParcel: jest.fn(),
      listCustomerParcels: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [TrackingService, { provide: ParcelReader, useValue: reader }],
    }).compile();
    service = module.get(TrackingService);
  });

  it('returns only the public allowlist, including nested history fields', async () => {
    const source = Object.assign(record(), {
      customerName: 'Private Name',
      phoneNumber: 'Private Phone',
      paymentData: { account: 'Private Payment' },
      internalNotes: 'Private Notes',
    });
    reader.findPublicParcel.mockResolvedValue(source);
    const result = await service.getPublicTracking('  test-123 ');
    expect(reader.findPublicParcel.mock.calls).toEqual([['TEST-123']]);
    expect(result).toEqual({
      trackingNumber: 'TEST-123',
      status: 'BOOKED',
      updatedAt: '2026-11-02T00:00:00Z',
      history: [{ status: 'BOOKED', occurredAt: '2026-11-01T00:00:00Z' }],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /Private|private|Internal|customer-a|parcel-a/,
    );
    expect(result.history).not.toBe(source.history);
    expect(result.history[0]).not.toBe(source.history[0]);
  });

  it('does not invent events or optional timestamps', async () => {
    reader.findPublicParcel.mockResolvedValue({
      ...record(),
      history: [],
      updatedAt: undefined,
    });
    const result = await service.getPublicTracking('TEST-123');
    expect(result.history).toEqual([]);
    expect(result).not.toHaveProperty('updatedAt');
  });

  it.each([null, { ...record(), trackingNumber: 'OTHER-123' }])(
    'returns 404 for missing or mismatched public records',
    async (parcel) => {
      reader.findPublicParcel.mockResolvedValue(parcel);
      await expect(
        service.getPublicTracking('TEST-123'),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it('returns customer details only after matching the authenticated owner', async () => {
    reader.findCustomerParcel.mockResolvedValue(record());
    const result = await service.getCustomerTracking(user, ' test-123 ');
    expect(reader.findCustomerParcel.mock.calls).toEqual([
      [user.id, 'TEST-123'],
    ]);
    expect(result).toMatchObject({
      id: 'parcel-a',
      origin: record().origin,
      destination: record().destination,
    });
    expect(JSON.stringify(result)).not.toContain('Internal dispatch note');
    expect(result).not.toHaveProperty('customerId');
    expect(reader.findPublicParcel.mock.calls).toHaveLength(0);
  });

  it.each([
    null,
    { ...record(), customerId: 'customer-b' },
    { ...record(), customerId: null },
    { ...record(), trackingNumber: 'OTHER-123' },
  ])(
    'uses the same 404 for missing, other-owned, or mismatched private records',
    async (parcel) => {
      reader.findCustomerParcel.mockResolvedValue(parcel);
      await expect(
        service.getCustomerTracking(user, 'TEST-123'),
      ).rejects.toMatchObject({
        response: { statusCode: 404, message: 'Parcel not found' },
      });
    },
  );

  it.each([null, undefined, { ...user, id: '' }, { ...user, id: '  ' }])(
    'rejects missing identities before reading storage',
    async (identity) => {
      await expect(
        service.getCustomerTracking(identity, 'TEST-123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(reader.findCustomerParcel.mock.calls).toHaveLength(0);
    },
  );

  it.each(['MERCHANT', 'COURIER', 'ADMIN', 'DISPATCHER'] as const)(
    'rejects the %s role before reading storage',
    async (role) => {
      await expect(
        service.getCustomerTracking({ ...user, role }, 'TEST-123'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(reader.findCustomerParcel.mock.calls).toHaveLength(0);
    },
  );

  it('validates service calls even when no HTTP validation pipe is involved', async () => {
    await expect(service.getPublicTracking('../bad')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.getCustomerTracking(user, '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(reader.findPublicParcel.mock.calls).toHaveLength(0);
    expect(reader.findCustomerParcel.mock.calls).toHaveLength(0);
  });

  it('propagates reader failures instead of returning fake or empty data', async () => {
    const failure = new Error('Reader unavailable');
    reader.findPublicParcel.mockRejectedValue(failure);
    reader.findCustomerParcel.mockRejectedValue(failure);
    await expect(service.getPublicTracking('TEST-123')).rejects.toBe(failure);
    await expect(service.getCustomerTracking(user, 'TEST-123')).rejects.toBe(
      failure,
    );
  });
});
