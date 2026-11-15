import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { ReceiptReader } from './receipt-reader.port.js';
import { ReceiptPdfService } from './receipt-pdf.service.js';
import { ReceiptService } from './receipt.service.js';
import type { OwnedReceiptRecord } from './receipt.types.js';
import { InvalidReceiptDataError } from './receipt-validation.js';

describe('ReceiptService authorization (isolated reader)', () => {
  const user: AuthenticatedUser = {
    id: 'customer-a',
    role: 'CUSTOMER',
    email: 'a@example.test',
  };
  const parcelId = 'b67b09cb-fb7a-4281-aef3-9183f76678c7';
  const fixture = (): OwnedReceiptRecord => ({
    parcelId,
    customerId: user.id,
    receipt: {
      reference: 'RCPT-TEST-001',
      trackingNumber: 'TEST-123',
      bookedAt: '2026-11-01T00:00:00Z',
      sender: { name: 'Alice Example' },
      recipient: { name: 'Bob Example' },
      pickupAddress: 'Test pickup',
      destinationAddress: 'Test destination',
      deliveryFeeMinor: 65000,
      currency: 'LKR',
    },
  });
  let service: ReceiptService;
  let reader: jest.Mocked<ReceiptReader>;
  let pdf: { generateFromTrustedData: jest.Mock<Promise<Buffer>, [unknown]> };

  beforeEach(async () => {
    reader = { findCustomerReceipt: jest.fn() };
    pdf = { generateFromTrustedData: jest.fn<Promise<Buffer>, [unknown]>() };
    const module = await Test.createTestingModule({
      providers: [
        ReceiptService,
        { provide: ReceiptReader, useValue: reader },
        { provide: ReceiptPdfService, useValue: pdf },
      ],
    }).compile();
    service = module.get(ReceiptService);
  });

  it('uses the verified owner and stored data before invoking the renderer', async () => {
    reader.findCustomerReceipt.mockResolvedValue(fixture());
    const bytes = Buffer.from('test-only renderer output');
    pdf.generateFromTrustedData.mockImplementation((data) => {
      expect(reader.findCustomerReceipt.mock.calls).toEqual([
        [user.id, parcelId],
      ]);
      expect(data).toEqual(fixture().receipt);
      expect(data).not.toHaveProperty('customerId');
      return Promise.resolve(bytes);
    });
    await expect(service.getCustomerReceipt(user, parcelId)).resolves.toEqual({
      bytes,
      filename: 'swiftdrop-receipt-TEST-123.pdf',
      contentType: 'application/pdf',
      cacheControl: 'private, no-store',
    });
    expect(pdf.generateFromTrustedData.mock.calls).toHaveLength(1);
  });

  it.each([
    null,
    { ...fixture(), customerId: 'other-owner' },
    { ...fixture(), parcelId: 'another-parcel' },
  ])(
    'returns identical 404 responses for missing and other-owned/mismatched records',
    async (record) => {
      reader.findCustomerReceipt.mockResolvedValue(record);
      await expect(
        service.getCustomerReceipt(user, parcelId),
      ).rejects.toMatchObject({
        response: { statusCode: 404, message: 'Receipt not found' },
      });
      expect(pdf.generateFromTrustedData.mock.calls).toHaveLength(0);
    },
  );

  it('checks ownership before even validating private receipt fields', async () => {
    const record = {
      ...fixture(),
      customerId: 'other-owner',
      receipt: undefined,
    };
    reader.findCustomerReceipt.mockResolvedValue(
      record as unknown as OwnedReceiptRecord,
    );
    await expect(
      service.getCustomerReceipt(user, parcelId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(pdf.generateFromTrustedData.mock.calls).toHaveLength(0);
  });

  it.each([null, undefined, { ...user, id: ' ' }])(
    'rejects unauthenticated identities before storage access',
    async (identity) => {
      await expect(
        service.getCustomerReceipt(identity, parcelId),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(reader.findCustomerReceipt.mock.calls).toHaveLength(0);
      expect(pdf.generateFromTrustedData.mock.calls).toHaveLength(0);
    },
  );

  it.each(['MERCHANT', 'COURIER', 'ADMIN', 'DISPATCHER'] as const)(
    'rejects the %s role',
    async (role) => {
      await expect(
        service.getCustomerReceipt({ ...user, role }, parcelId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(reader.findCustomerReceipt.mock.calls).toHaveLength(0);
    },
  );

  it.each([
    '../receipt.pdf',
    '',
    null,
    { parcelId, customerId: user.id, deliveryFeeMinor: 1 },
  ])('rejects invalid parcel IDs and receipt payloads %p', async (input) => {
    await expect(
      service.getCustomerReceipt(user, input),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reader.findCustomerReceipt.mock.calls).toHaveLength(0);
  });

  it('rejects missing authoritative charge data before rendering', async () => {
    const record = fixture();
    reader.findCustomerReceipt.mockResolvedValue({
      ...record,
      receipt: { ...record.receipt, deliveryFeeMinor: -1 },
    });
    await expect(
      service.getCustomerReceipt(user, parcelId),
    ).rejects.toBeInstanceOf(InvalidReceiptDataError);
    expect(pdf.generateFromTrustedData.mock.calls).toHaveLength(0);
  });

  it('uses a validated tracking number for download filenames, never the receipt reference', async () => {
    const record = fixture();
    reader.findCustomerReceipt.mockResolvedValue({
      ...record,
      receipt: {
        ...record.receipt,
        reference: '../reference',
        trackingNumber: ' test-123 ',
      },
    });
    pdf.generateFromTrustedData.mockResolvedValue(
      Buffer.from('test-only renderer output'),
    );
    await expect(
      service.getCustomerReceipt(user, parcelId),
    ).resolves.toMatchObject({ filename: 'swiftdrop-receipt-TEST-123.pdf' });
  });

  it('propagates source/render failures without producing a replacement receipt', async () => {
    const failure = new Error('Unavailable');
    reader.findCustomerReceipt.mockRejectedValueOnce(failure);
    await expect(service.getCustomerReceipt(user, parcelId)).rejects.toBe(
      failure,
    );
    expect(pdf.generateFromTrustedData.mock.calls).toHaveLength(0);
    reader.findCustomerReceipt.mockResolvedValue(fixture());
    pdf.generateFromTrustedData.mockRejectedValue(failure);
    await expect(service.getCustomerReceipt(user, parcelId)).rejects.toBe(
      failure,
    );
  });
});
