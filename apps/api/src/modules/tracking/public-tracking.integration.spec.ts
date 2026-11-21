import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import {
  ApprovalStatus,
  ParcelStatus,
  Role,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ApprovalGuard } from '../auth/guards/approval.guard.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import {
  AUTH_COOKIE_NAME,
  cookieParserMiddleware,
} from '../auth/utils/cookie.util.js';
import { ParcelsService } from '../parcels/parcels.service.js';
import { UsersService } from '../users/users.service.js';
import { PUBLIC_TRACKING_PER_ADDRESS_LIMIT } from './guards/public-tracking-rate-limit.guard.js';
import { TrackingModule } from './tracking.module.js';

const SECRET = 'public-tracking-test-secret-at-least-32-bytes';
const TOKEN = 'SD-0123456789ABCDEFFEDCBA9876543210';
const ROOT = '/api/v1/tracking';
const BOOKED = new Date('2026-01-01T01:00:00.000Z');
const ASSIGNED = new Date('2026-01-01T02:00:00.000Z');
const UPDATED = new Date('2026-01-01T03:00:00.000Z');

describe('Public tracking HTTP integration (isolated persistence)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let findUnique: jest.Mock;
  let listForCustomerTracking: jest.Mock;
  let findById: jest.Mock;

  function fixture(status: ParcelStatus = ParcelStatus.IN_TRANSIT) {
    // Deliberately overpopulated to catch leaks even if a reader returns more
    // than its SELECT contract. These records exist only in isolated tests.
    return {
      id: 'private-parcel-id',
      customerId: 'private-customer-id',
      trackingNumber: TOKEN,
      status,
      createdAt: BOOKED,
      updatedAt: UPDATED,
      senderName: 'PRIVATE_SENDER',
      senderAddress: 'PRIVATE_PICKUP_ADDRESS',
      recipientName: 'PRIVATE_RECIPIENT',
      recipientAddress: 'PRIVATE_DESTINATION_ADDRESS',
      recipientPhone: 'PRIVATE_PHONE',
      email: 'PRIVATE_EMAIL@example.test',
      costLkr: 999,
      failureReason: 'PRIVATE_FAILURE_REASON',
      statusHistory: [
        {
          id: 'private-booking-id',
          status: ParcelStatus.PENDING,
          createdAt: BOOKED,
          note: 'PRIVATE_BOOKING_NOTE',
          location: 'PRIVATE_LOCATION',
        },
      ],
      statusEvents: [
        {
          id: 'private-courier-id',
          status,
          createdAt: UPDATED,
          note: 'PRIVATE_COURIER_NOTE',
          actorId: 'private-actor-id',
          proofId: 'private-proof-id',
        },
        {
          id: 'private-assignment-id',
          status: ParcelStatus.ASSIGNED,
          createdAt: ASSIGNED,
          note: 'PRIVATE_ASSIGNMENT_NOTE',
          actorId: 'private-actor-id',
          proofId: null,
        },
      ],
    };
  }

  beforeEach(async () => {
    findUnique = jest.fn().mockResolvedValue(fixture());
    listForCustomerTracking = jest.fn().mockResolvedValue([]);
    findById = jest.fn().mockResolvedValue({
      id: 'approved-customer',
      isActive: true,
      approvalStatus: ApprovalStatus.APPROVED,
    });
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
      .overrideProvider(ParcelsService)
      .useValue({ listForCustomerTracking })
      .overrideProvider(PrismaService)
      .useValue({ parcel: { findUnique } })
      .compile();
    jwt = module.get(JwtService);
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

  afterEach(async () => {
    if (app) await app.close();
  });

  function get(number = TOKEN) {
    return request(app.getHttpServer()).get(
      `${ROOT}/${encodeURIComponent(number)}`,
    );
  }

  function expectPrivacyHeaders(response: Response) {
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  }

  it('returns only allowlisted status and real event dates to anonymous visitors', async () => {
    const response = await get().expect(200);
    expect(response.body as unknown).toEqual({
      trackingNumber: TOKEN,
      status: 'IN_TRANSIT',
      updatedAt: UPDATED.toISOString(),
      history: [
        { status: 'PENDING', occurredAt: BOOKED.toISOString() },
        { status: 'ASSIGNED', occurredAt: ASSIGNED.toISOString() },
        { status: 'IN_TRANSIT', occurredAt: UPDATED.toISOString() },
      ],
    });
    expect(response.text).not.toMatch(
      /PRIVATE_|private-|customerId|costLkr|sender|recipient|email|note|proof|actor|location|Address/,
    );
    expectPrivacyHeaders(response);
    expect(listForCustomerTracking).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();
    expect(findUnique).toHaveBeenCalledWith({
      where: { trackingNumber: TOKEN },
      select: {
        trackingNumber: true,
        status: true,
        updatedAt: true,
        statusHistory: {
          select: { status: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        statusEvents: {
          select: { status: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  });

  it('remains public with invalid cookies, invalid bearer tokens, and a valid session', async () => {
    const anonymous = await get().expect(200);
    const cookie = await get()
      .set('Cookie', `${AUTH_COOKIE_NAME}=invalid-cookie`)
      .expect(200);
    const bearer = await get()
      .set('Authorization', 'Bearer invalid-token')
      .expect(200);
    const token = jwt.sign({
      sub: 'approved-customer',
      email: 'customer@example.test',
      role: Role.CUSTOMER,
      approvalStatus: ApprovalStatus.APPROVED,
    });
    const authenticated = await get()
      .set('Cookie', `${AUTH_COOKIE_NAME}=${token}`)
      .expect(200);
    for (const response of [cookie, bearer, authenticated]) {
      expect(response.body as unknown).toEqual(anonymous.body as unknown);
    }
    expect(findById).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .get('/api/v1/customer/deliveries')
      .set('Cookie', `${AUTH_COOKIE_NAME}=${token}`)
      .expect(200);
    expect(findById).toHaveBeenCalled();
    expect(listForCustomerTracking).toHaveBeenCalledWith('approved-customer');
  });

  it('keeps every private tracking/history endpoint authenticated', async () => {
    for (const path of [
      `/api/v1/customer/tracking/${TOKEN}`,
      '/api/v1/customer/deliveries',
      '/api/v1/customer/deliveries/summary',
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
    }
    expect(findUnique).not.toHaveBeenCalled();
    expect(listForCustomerTracking).not.toHaveBeenCalled();
  });

  it.each(Object.values(ParcelStatus))(
    'preserves the persisted %s status and its recorded timestamp',
    async (status) => {
      const parcel = fixture(status);
      parcel.statusHistory = [{ ...parcel.statusHistory[0], status }];
      parcel.statusEvents = [];
      findUnique.mockResolvedValue(parcel);
      const response = await get().expect(200);
      expect(response.body as unknown).toEqual({
        trackingNumber: TOKEN,
        status,
        updatedAt: UPDATED.toISOString(),
        history: [{ status, occurredAt: BOOKED.toISOString() }],
      });
    },
  );

  it('does not manufacture events from a status or updatedAt, and retains repeated real events', async () => {
    const parcel = fixture(ParcelStatus.ASSIGNED);
    parcel.statusHistory = [];
    parcel.statusEvents = [];
    findUnique.mockResolvedValue(parcel);
    const empty = await get().expect(200);
    expect(empty.body as unknown).toMatchObject({
      status: 'ASSIGNED',
      history: [],
    });

    const repeated = fixture(ParcelStatus.IN_TRANSIT);
    repeated.statusHistory = [];
    repeated.statusEvents = [
      { ...repeated.statusEvents[0], createdAt: UPDATED },
      { ...repeated.statusEvents[0], createdAt: ASSIGNED },
    ];
    findUnique.mockResolvedValue(repeated);
    const recorded = await get().expect(200);
    expect(recorded.body as unknown).toMatchObject({
      history: [
        { status: 'IN_TRANSIT', occurredAt: ASSIGNED.toISOString() },
        { status: 'IN_TRANSIT', occurredAt: UPDATED.toISOString() },
      ],
    });
  });

  it('normalizes lower case and surrounding whitespace before querying', async () => {
    const response = await get(`  ${TOKEN.toLowerCase()}  `).expect(200);
    expect(response.body as unknown).toMatchObject({ trackingNumber: TOKEN });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { trackingNumber: TOKEN } }),
    );
  });

  it('returns identical safe 404s for legacy, ineligible, and unknown secure numbers', async () => {
    // Existing legacy parcels must not become discoverable, even if the storage
    // mock would return one. Public eligibility is checked before persistence.
    const legacy = await get('SD-21011').expect(404);
    const ineligible = await get('SEED-PARCEL-123').expect(404);
    expect(findUnique).not.toHaveBeenCalled();
    findUnique.mockResolvedValue(null);
    const unknown = await get('SD-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF').expect(
      404,
    );
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(legacy.body as unknown).toEqual(unknown.body as unknown);
    expect(ineligible.body as unknown).toEqual(unknown.body as unknown);
    expect(unknown.body as unknown).toMatchObject({
      statusCode: 404,
      message: 'Parcel not found',
    });
    for (const response of [legacy, ineligible, unknown]) {
      expectPrivacyHeaders(response);
    }
  });

  it.each(['---', 'SD_bad', 'SD/123', 'A'.repeat(65)])(
    'rejects malformed input %p without querying storage',
    async (number) => {
      const response = await get(number).expect(400);
      expect(findUnique).not.toHaveBeenCalled();
      expectPrivacyHeaders(response);
    },
  );

  it('limits the twenty-first lookup despite changing forwarded address headers', async () => {
    for (let index = 0; index < PUBLIC_TRACKING_PER_ADDRESS_LIMIT; index++) {
      await get().set('X-Forwarded-For', `203.0.113.${index}`).expect(200);
    }
    const limited = await get()
      .set('X-Forwarded-For', '203.0.113.250')
      .expect(429);
    expect(findUnique).toHaveBeenCalledTimes(PUBLIC_TRACKING_PER_ADDRESS_LIMIT);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expectPrivacyHeaders(limited);
    expect(limited.body as unknown).toMatchObject({
      message: 'Too many tracking requests. Please try again later.',
    });
    expect(limited.text).not.toContain(TOKEN);
  });

  it('limits malformed and legacy attempts before DTO validation or database lookup', async () => {
    for (let index = 0; index < PUBLIC_TRACKING_PER_ADDRESS_LIMIT; index++) {
      await get(index % 2 ? 'SD-21011' : 'SD_bad').expect(
        index % 2 ? 404 : 400,
      );
    }
    await get().expect(429);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns a generic error when persistence fails instead of leaking internal details', async () => {
    findUnique.mockRejectedValue(
      new Error('PRIVATE_SQL_CREDENTIALS and database failure details'),
    );
    const response = await get().expect(500);
    expect(response.body as unknown).toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(response.text).not.toMatch(/PRIVATE_|SQL|CREDENTIALS|database/);
    expectPrivacyHeaders(response);
  });
});
