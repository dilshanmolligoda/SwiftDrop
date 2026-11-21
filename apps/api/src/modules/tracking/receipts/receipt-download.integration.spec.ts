import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  ApprovalStatus,
  ParcelStatus,
  Role,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { ApprovalGuard } from '../../auth/guards/approval.guard.js';
import { CsrfGuard } from '../../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import {
  AUTH_COOKIE_NAME,
  cookieParserMiddleware,
} from '../../auth/utils/cookie.util.js';
import { ParcelsService } from '../../parcels/parcels.service.js';
import { UsersService } from '../../users/users.service.js';
import { TrackingModule } from '../tracking.module.js';
import { ReceiptPdfService } from './receipt-pdf.service.js';

const SECRET = 'receipt-download-integration-secret-at-least-32-bytes';
const OWNER = 'a2ca2a7c-8659-4c04-8c15-73e53c1188af';
const OTHER = 'b2ca2a7c-8659-4c04-8c15-73e53c1188af';
const PARCEL = 'b67b09cb-fb7a-4281-aef3-9183f76678c7';
const SECURE_NUMBER = 'SD-0123456789ABCDEFFEDCBA9876543210';
const ROOT = '/api/v1/customer/deliveries';
const BOOKED = new Date('2026-11-01T06:30:00.000Z');

/** Decode the actual PDF page streams, without replacing the renderer. */
async function pdfText(bytes: unknown): Promise<string> {
  expect(Buffer.isBuffer(bytes)).toBe(true);
  if (!Buffer.isBuffer(bytes)) throw new Error('Expected PDF bytes');
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  return pdf
    .getPages()
    .flatMap((page) => {
      const contents = page.node.Contents();
      const streams =
        contents instanceof PDFArray
          ? Array.from({ length: contents.size() }, (_, index) =>
              contents.lookup(index, PDFRawStream),
            )
          : contents instanceof PDFRawStream
            ? [contents]
            : [];
      return streams.flatMap((stream) => {
        const commands = Buffer.from(
          decodePDFRawStream(stream).decode(),
        ).toString('latin1');
        return Array.from(commands.matchAll(/<([0-9A-F]+)>\s*Tj/g), (match) =>
          Buffer.from(match[1], 'hex').toString('latin1'),
        );
      });
    })
    .join('\n');
}

describe('Customer PDF receipt downloads (isolated persistence, real renderer)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let findFirst: jest.Mock;
  let findUnique: jest.Mock;
  let findById: jest.Mock;
  let generatePdf: jest.SpyInstance<Promise<Buffer>, [unknown]>;

  const fixture = () => ({
    id: PARCEL,
    customerId: OWNER,
    trackingNumber: SECURE_NUMBER,
    createdAt: BOOKED,
    senderName: 'sender@example.test',
    senderAddress: '123 Stored Pickup, Colombo',
    recipientName: 'Stored Recipient',
    recipientAddress: '456 Stored Destination, Kandy',
    recipientPhone: '+94 77 000 0000',
    costLkr: new Prisma.Decimal('0.29'),
    status: ParcelStatus.PENDING,
    deliveredAt: null as Date | null,
    // Deliberately overpopulated to catch accidental document leakage.
    deliveryInstructions: 'INTERNAL_NOTES_DO_NOT_PRINT',
    failureReason: 'INTERNAL_FAILURE_DO_NOT_PRINT',
    deliveredProofId: 'INTERNAL_PROOF_DO_NOT_PRINT',
  });

  beforeAll(async () => {
    findFirst = jest.fn();
    findUnique = jest.fn();
    findById = jest.fn();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_ACCESS_SECRET: SECRET,
              CORS_ORIGINS: 'http://localhost:5173',
            }),
          ],
        }),
        JwtModule.register({
          secret: SECRET,
          signOptions: { algorithm: 'HS256', expiresIn: '15m' },
        }),
        TrackingModule,
      ],
      providers: [
        { provide: UsersService, useValue: { findById } },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ApprovalGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ parcel: { findFirst, findUnique } })
      .overrideProvider(ParcelsService)
      .useValue({ listForCustomer: jest.fn().mockResolvedValue([]) })
      .compile();
    jwt = module.get(JwtService);
    generatePdf = jest.spyOn(
      module.get(ReceiptPdfService),
      'generateFromTrustedData',
    );
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api/v1');
    app.use(cookieParserMiddleware);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    findFirst.mockReset().mockResolvedValue(fixture());
    findUnique.mockReset().mockResolvedValue(null);
    findById.mockReset().mockResolvedValue({
      id: OWNER,
      isActive: true,
      approvalStatus: ApprovalStatus.APPROVED,
    });
    generatePdf.mockClear();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const token = (role: Role = Role.CUSTOMER, id = OWNER) =>
    jwt.sign({
      sub: id,
      email: 'customer@example.test',
      role,
      approvalStatus: ApprovalStatus.APPROVED,
    });
  const get = (parcelId = PARCEL) =>
    request(app.getHttpServer())
      .get(`${ROOT}/${encodeURIComponent(parcelId)}/receipt`)
      .set('Cookie', `${AUTH_COOKIE_NAME}=${token()}`);

  it('returns an actual private PDF with accurate persisted booking data and safe headers', async () => {
    const response = await get().buffer(true).expect(200);
    expect(response.headers['content-type']).toMatch(
      /^application\/pdf(?:;|$)/,
    );
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="swiftdrop-receipt-${SECURE_NUMBER}.pdf"`,
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['access-control-expose-headers']).toMatch(
      /Content-Disposition/i,
    );
    const text = await pdfText(response.body as unknown);
    for (const expected of [
      'SwiftDrop',
      'Delivery receipt',
      'PARCEL REFERENCE',
      PARCEL,
      SECURE_NUMBER,
      'sender@example.test',
      'Stored Recipient',
      '123 Stored Pickup, Colombo',
      '456 Stored Destination, Kandy',
      '+94 77 000 0000',
      'LKR 0.29',
      '1 Nov 2026, 12:00 (Sri Lanka time)',
      'does not confirm payment',
    ])
      expect(text).toContain(expected);
    expect(text).not.toMatch(
      /INTERNAL_|RECORDED DELIVERY DATE|PAYMENT CONFIRMED|PAID/,
    );
    expect(findFirst.mock.calls).toHaveLength(1);
    expect((findFirst.mock.calls as unknown[][])[0][0]).toMatchObject({
      where: { id: PARCEL, customerId: OWNER },
    });
    expect(generatePdf.mock.calls).toHaveLength(1);
  });

  it.each(['SD-21011', SECURE_NUMBER])(
    'downloads receipts for the authenticated owner of %s',
    async (trackingNumber) => {
      findFirst.mockResolvedValue({ ...fixture(), trackingNumber });
      const response = await get().buffer(true).expect(200);
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="swiftdrop-receipt-${trackingNumber}.pdf"`,
      );
      expect(await pdfText(response.body as unknown)).toContain(trackingNumber);
    },
  );

  it.each(Object.values(ParcelStatus))(
    'allows a booking charge receipt for %s without inventing a delivery date',
    async (status) => {
      findFirst.mockResolvedValue({ ...fixture(), status });
      const response = await get().buffer(true).expect(200);
      const text = await pdfText(response.body as unknown);
      expect(text).toContain(status);
      expect(text).toContain('Recorded delivery fee');
      expect(text).toContain('does not confirm payment');
      expect(text).not.toContain('RECORDED DELIVERY DATE');
    },
  );

  it('includes a delivered date only when actually persisted', async () => {
    findFirst.mockResolvedValue({
      ...fixture(),
      status: ParcelStatus.DELIVERED,
      deliveredAt: new Date('2026-11-03T06:30:00Z'),
    });
    const response = await get().buffer(true).expect(200);
    const text = await pdfText(response.body as unknown);
    expect(text).toContain('RECORDED DELIVERY DATE');
    expect(text).toContain('3 Nov 2026, 12:00 (Sri Lanka time)');
  });

  it.each([
    ['0', 'LKR 0.00'],
    ['350.10', 'LKR 350.10'],
    ['99999999.99', 'LKR 99,999,999.99'],
  ])('preserves exact persisted fee %s', async (amount, rendered) => {
    findFirst.mockResolvedValue({
      ...fixture(),
      costLkr: new Prisma.Decimal(amount),
    });
    const response = await get().buffer(true).expect(200);
    expect(await pdfText(response.body as unknown)).toContain(rendered);
  });

  it('requires authentication before reading or rendering receipt data', async () => {
    for (const authorization of [undefined, 'Bearer invalid-token']) {
      const attempt = request(app.getHttpServer()).get(
        `${ROOT}/${PARCEL}/receipt`,
      );
      if (authorization) attempt.set('Authorization', authorization);
      await attempt.expect(401);
    }
    expect(findFirst.mock.calls).toHaveLength(0);
    expect(generatePdf.mock.calls).toHaveLength(0);
  });

  it.each([Role.COURIER, Role.MERCHANT, Role.ADMIN, Role.DISPATCHER])(
    'rejects %s before returning receipt data',
    async (role) => {
      await request(app.getHttpServer())
        .get(`${ROOT}/${PARCEL}/receipt`)
        .set('Authorization', `Bearer ${token(role)}`)
        .expect(403);
      expect(findFirst.mock.calls).toHaveLength(0);
      expect(generatePdf.mock.calls).toHaveLength(0);
    },
  );

  it.each([ApprovalStatus.PENDING, ApprovalStatus.REJECTED])(
    'checks current %s approval rather than trusting the JWT approval claim',
    async (approvalStatus) => {
      findById.mockResolvedValue({ id: OWNER, isActive: true, approvalStatus });
      await get().expect(403);
      expect(findFirst.mock.calls).toHaveLength(0);
      expect(generatePdf.mock.calls).toHaveLength(0);
    },
  );

  it('uses identical 404 responses for missing and other-owned parcels before validating private fields', async () => {
    findFirst.mockResolvedValueOnce(null);
    const missing = await get().expect(404);
    findFirst.mockResolvedValueOnce({
      ...fixture(),
      customerId: OTHER,
      senderName: '',
      costLkr: undefined,
    });
    const other = await get().expect(404);
    expect(other.body as unknown).toEqual(missing.body as unknown);
    expect(generatePdf.mock.calls).toHaveLength(0);
    for (const [query] of findFirst.mock.calls)
      expect(query as unknown).toMatchObject({
        where: { id: PARCEL, customerId: OWNER },
      });
  });

  it('does not accept client ownership, receipt amount, currency, or tracking-number overrides', async () => {
    const response = await get()
      .query({
        customerId: OTHER,
        deliveryFeeMinor: 0,
        currency: 'USD',
        trackingNumber: 'EVIL',
      })
      .buffer(true)
      .expect(200);
    const text = await pdfText(response.body as unknown);
    expect(text).toContain('LKR 0.29');
    expect(text).toContain(SECURE_NUMBER);
    expect(text).not.toMatch(/USD|EVIL/);
    expect((findFirst.mock.calls as unknown[][])[0][0]).toMatchObject({
      where: { id: PARCEL, customerId: OWNER },
    });
  });

  it.each(['not-a-uuid', '../receipt.pdf', ''])(
    'rejects invalid parcel ID %p before storage access',
    async (parcelId) => {
      await get(parcelId).expect(parcelId ? 400 : 404);
      expect(findFirst.mock.calls).toHaveLength(0);
      expect(generatePdf.mock.calls).toHaveLength(0);
    },
  );

  it.each([
    { senderName: '' },
    { recipientName: '' },
    { senderAddress: '' },
    { recipientAddress: '' },
    { costLkr: new Prisma.Decimal('-1') },
    { costLkr: new Prisma.Decimal('0.001') },
  ])(
    'returns a safe unavailable response for invalid required persisted data %p',
    async (override) => {
      findFirst.mockResolvedValue({ ...fixture(), ...override });
      const response = await get().expect(503);
      expect(response.body as unknown).toMatchObject({
        message: 'Receipt is currently unavailable for this parcel',
      });
      expect(response.text).not.toMatch(
        /senderName|recipientName|costLkr|senderAddress|recipientAddress|sender@example|Stored Recipient/,
      );
    },
  );

  it('returns a safe unavailable response for unsupported receipt text instead of corrupting it', async () => {
    findFirst.mockResolvedValue({ ...fixture(), recipientName: 'සඳුනි' });
    const response = await get().expect(503);
    expect(response.body as unknown).toMatchObject({
      message: 'Receipt is currently unavailable for this parcel',
    });
    expect(response.text).not.toMatch(/සඳුනි|Helvetica|Unicode|recipientName/);
  });

  it('never returns receipts through public tracking or a static receipt route', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/tracking/${SECURE_NUMBER}/receipt`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/parcels/${PARCEL}/receipt`)
      .set('Cookie', `${AUTH_COOKIE_NAME}=${token()}`)
      .expect(404);
    expect(findFirst.mock.calls).toHaveLength(0);
    expect(generatePdf.mock.calls).toHaveLength(0);
  });

  it('returns a generic server failure when persistence is unavailable', async () => {
    findFirst.mockRejectedValue(
      new Error('PRIVATE_DATABASE_CONNECTION_DETAILS'),
    );
    const response = await get().expect(500);
    expect(response.body as unknown).toMatchObject({
      message: 'Internal server error',
    });
    expect(response.text).not.toContain('PRIVATE_DATABASE');
  });
});
