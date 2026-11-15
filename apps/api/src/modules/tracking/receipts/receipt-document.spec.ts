import { buildReceiptDocument } from './receipt-document.js';
import type { ReceiptData } from './receipt.types.js';
import {
  InvalidReceiptDataError,
  validateReceiptData,
} from './receipt-validation.js';

describe('Receipt validation and formatting', () => {
  // Isolated test fixture; no receipt records are seeded in application code.
  const fixture = (): ReceiptData => ({
    reference: 'RCPT-TEST-001',
    trackingNumber: 'TEST-123',
    bookedAt: '2026-10-31T18:30:00Z',
    sender: { name: 'Alice Example', phone: '+94 11 000 0000' },
    recipient: { name: 'Bob Example' },
    pickupAddress: '123 Test Lane\nColombo',
    destinationAddress: '456 Fixture Road\nKandy',
    deliveryFeeMinor: 65000,
    currency: 'LKR',
    deliveryStatus: 'SOURCE_STATUS',
  });

  it('builds an explicit document with Sri Lanka dates and recorded charges', () => {
    const document = buildReceiptDocument({
      ...fixture(),
      deliveredAt: '2026-11-02T06:30:00Z',
    });
    expect(document).toEqual({
      company: 'SwiftDrop',
      title: 'Delivery receipt',
      reference: 'RCPT-TEST-001',
      trackingNumber: 'TEST-123',
      bookingDate: '1 Nov 2026, 00:00 (Sri Lanka time)',
      deliveryDate: '2 Nov 2026, 12:00 (Sri Lanka time)',
      deliveryStatus: 'SOURCE_STATUS',
      sender: fixture().sender,
      recipient: fixture().recipient,
      pickupAddress: fixture().pickupAddress,
      destinationAddress: fixture().destinationAddress,
      chargeLabel: 'Recorded delivery fee',
      formattedCharge: 'LKR 650.00',
      note: 'This receipt records the booked delivery charge. It does not confirm payment.',
    });
  });

  it.each([
    [0, 'LKR 0.00'],
    [1, 'LKR 0.01'],
    [9, 'LKR 0.09'],
    [10, 'LKR 0.10'],
    [99, 'LKR 0.99'],
    [100, 'LKR 1.00'],
    [101, 'LKR 1.01'],
    [123456, 'LKR 1,234.56'],
    [Number.MAX_SAFE_INTEGER, 'LKR 90,071,992,547,409.91'],
  ])('formats %s cents exactly as %s', (deliveryFeeMinor, expected) => {
    expect(
      buildReceiptDocument({ ...fixture(), deliveryFeeMinor }).formattedCharge,
    ).toBe(expected);
  });

  it.each([
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '65000',
    null,
    undefined,
    65000n,
  ])(
    'rejects invalid recorded amount %p without rounding/coercion',
    (deliveryFeeMinor) => {
      expect(() =>
        buildReceiptDocument({ ...fixture(), deliveryFeeMinor }),
      ).toThrow(InvalidReceiptDataError);
    },
  );

  it.each([
    'reference',
    'trackingNumber',
    'bookedAt',
    'sender',
    'recipient',
    'pickupAddress',
    'destinationAddress',
    'deliveryFeeMinor',
    'currency',
  ])('requires %s', (field) => {
    expect(() =>
      buildReceiptDocument({ ...fixture(), [field]: undefined }),
    ).toThrow(InvalidReceiptDataError);
  });

  it.each([
    null,
    [],
    {},
    { reference: '' },
    { sender: { phone: '+94 11 000 0000' } },
    { recipient: { name: ' ' } },
    { reference: 'a'.repeat(81) },
    { sender: { name: 'a'.repeat(101) } },
    { sender: { name: 'Name', phone: null } },
    { destinationAddress: 'a'.repeat(501) },
    { pickupAddress: 'line\n'.repeat(9) },
    { deliveryStatus: '' },
    { reference: 'Header\r\nInjection' },
    { recipient: { name: 'Bidi\u202eOverride' } },
    { pickupAddress: 'Address\u0000hidden' },
    { trackingNumber: '../bad' },
    { currency: 'USD' },
    { currency: 'JPY' },
  ])('rejects incomplete or malformed data %p', (override) => {
    const data =
      override && !Array.isArray(override) && Object.keys(override).length
        ? { ...fixture(), ...override }
        : override;
    expect(() => buildReceiptDocument(data)).toThrow(InvalidReceiptDataError);
  });

  it.each([
    '2026-11-01',
    '2026-11-01T12:00:00',
    '2026-02-30T12:00:00Z',
    'not-a-date',
    null,
  ])('rejects invalid or timezone-ambiguous booking date %p', (bookedAt) => {
    expect(() => buildReceiptDocument({ ...fixture(), bookedAt })).toThrow(
      InvalidReceiptDataError,
    );
  });

  it('rejects invalid delivery dates and does not invent a status or delivery date', () => {
    expect(() =>
      buildReceiptDocument({
        ...fixture(),
        deliveredAt: '2026-01-01T00:00:00Z',
      }),
    ).toThrow(InvalidReceiptDataError);
    expect(() =>
      buildReceiptDocument({ ...fixture(), deliveredAt: 'invalid' }),
    ).toThrow(InvalidReceiptDataError);
    const document = buildReceiptDocument({
      ...fixture(),
      deliveryStatus: undefined,
    });
    expect(document.deliveryStatus).toBe('Not recorded');
    expect(document).not.toHaveProperty('deliveryDate');
    expect(document.recipient).not.toHaveProperty('phone');
  });

  it('normalizes text without mutating the source or passing through extra payment/owner fields', () => {
    const source = Object.assign(fixture(), {
      customerId: 'private-owner',
      amountPaid: 999999,
      paymentConfirmed: true,
      sender: {
        name: '  Alice Example  ',
        phone: '+94 11 000 0000',
        internalNote: 'secret',
      },
      trackingNumber: '  test-123  ',
    });
    const normalized = validateReceiptData(source);
    expect(normalized.sender.name).toBe('Alice Example');
    expect(normalized.trackingNumber).toBe('TEST-123');
    expect(normalized).not.toHaveProperty('customerId');
    expect(normalized).not.toHaveProperty('paymentConfirmed');
    expect(normalized.sender).not.toHaveProperty('internalNote');
    expect(source.sender.name).toBe('  Alice Example  ');
    expect(buildReceiptDocument(source).formattedCharge).toBe('LKR 650.00');
  });

  it('preserves Unicode information for a future compatible font configuration', () => {
    const document = buildReceiptDocument({
      ...fixture(),
      sender: { name: 'සඳුනි' },
    });
    expect(document.sender.name).toBe('සඳුනි');
  });

  it('never includes customer values in validation error messages', () => {
    expect(() =>
      buildReceiptDocument({
        ...fixture(),
        sender: { name: 'Private\u0000Name' },
      }),
    ).toThrow('Missing or invalid receipt field: sender.name');
  });
});
