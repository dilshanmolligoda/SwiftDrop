import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
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
import { UsersService } from '../users/users.service.js';
import type { StoredCustomerParcel } from './adapters/parcel-record.mapper.js';
import { DeliveryHistoryService } from './services/delivery-history.service.js';
import { TrackingModule } from './tracking.module.js';

const OWNER = 'a2ca2a7c-8659-4c04-8c15-73e53c1188af';
const OTHER = 'b2ca2a7c-8659-4c04-8c15-73e53c1188af';
const NUMBER = 'SD-0123456789ABCDEFFEDCBA9876543210';
const SECRET = 'courier-timeline-test-secret-at-least-32-bytes';

describe('Persisted courier events through real tracking readers (isolated Prisma)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let history: DeliveryHistoryService;
  let findMany: jest.Mock;
  let findUnique: jest.Mock;
  let records: StoredCustomerParcel[];
  const fixture = (): StoredCustomerParcel => ({
    id: 'b67b09cb-fb7a-4281-aef3-9183f76678c7',
    customerId: OWNER,
    trackingNumber: NUMBER,
    status: ParcelStatus.PENDING,
    senderAddress: 'PRIVATE_PICKUP',
    recipientAddress: 'PRIVATE_DESTINATION',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-11-02T00:00:00Z'),
    deliveredAt: null,
    statusHistory: [
      {
        id: 'booking',
        status: ParcelStatus.PENDING,
        createdAt: new Date('2026-10-01T00:00:00Z'),
      },
    ],
    statusEvents: [],
  });

  beforeAll(async () => {
    findMany = jest.fn();
    findUnique = jest.fn();
    const users = {
      findById: jest.fn((id: string) =>
        Promise.resolve({
          id,
          isActive: true,
          approvalStatus: ApprovalStatus.APPROVED,
        }),
      ),
    };
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
        { provide: UsersService, useValue: users },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ApprovalGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ parcel: { findMany, findUnique } })
      .compile();
    jwt = module.get(JwtService);
    history = module.get(DeliveryHistoryService);
    app = module.createNestApplication();
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
    records = [fixture()];
    findMany
      .mockReset()
      .mockImplementation((query: { where: { customerId: string } }) =>
        Promise.resolve(
          records.filter(
            (record) => record.customerId === query.where.customerId,
          ),
        ),
      );
    findUnique
      .mockReset()
      .mockImplementation((query: { where: { trackingNumber: string } }) =>
        Promise.resolve(
          records.find(
            (record) => record.trackingNumber === query.where.trackingNumber,
          ) ?? null,
        ),
      );
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  function owned(path: string, owner = OWNER) {
    const token = jwt.sign({
      sub: owner,
      email: 'test@example.test',
      role: Role.CUSTOMER,
    });
    return request(app.getHttpServer())
      .get('/api/v1/customer/' + path)
      .set('Cookie', `${AUTH_COOKIE_NAME}=${token}`);
  }

  it('reads booking, assignment, pickup, transit and delivery into matching private/public timelines', async () => {
    const parcel = records[0];
    const statuses = [
      ParcelStatus.CREATED,
      ParcelStatus.ASSIGNED,
      ParcelStatus.PICKED_UP,
      ParcelStatus.IN_TRANSIT,
      ParcelStatus.OUT_FOR_DELIVERY,
      ParcelStatus.DELIVERED,
    ];
    parcel.status = ParcelStatus.DELIVERED;
    parcel.statusEvents = statuses
      .map((status, index) =>
        Object.assign(
          {
            id: `courier-${index}`,
            status,
            createdAt: new Date(`2026-11-01T0${index}:00:00Z`),
          },
          {
            actorId: 'PRIVATE_COURIER',
            proofId: 'PRIVATE_PROOF',
            note: 'PRIVATE_NOTE',
          },
        ),
      )
      .reverse();
    // A mirrored write must not produce a second visible delivery transition.
    parcel.statusHistory.push({
      id: 'delivery-mirror',
      status: ParcelStatus.DELIVERED,
      createdAt: new Date('2026-11-01T05:00:00Z'),
    });
    const privateResponse = await owned('tracking/' + NUMBER).expect(200);
    const publicResponse = await request(app.getHttpServer())
      .get('/api/v1/tracking/' + NUMBER)
      .expect(200);
    const body = privateResponse.body as {
      status: string;
      deliveredAt: string;
      history: { status: string; occurredAt: string }[];
    };
    expect(body.history.map((event) => event.status)).toEqual([
      'PENDING',
      ...statuses,
    ]);
    expect(body.deliveredAt).toBe('2026-11-01T05:00:00.000Z');
    expect(publicResponse.body as unknown).toMatchObject({
      status: 'DELIVERED',
      history: body.history,
    });
    expect(publicResponse.text).not.toMatch(
      /PRIVATE_|customerId|proof|actor|location|note|sender|recipient|deliveredAt/,
    );
    expect(privateResponse.text).not.toMatch(
      /PRIVATE_COURIER|PRIVATE_PROOF|PRIVATE_NOTE/,
    );
    const list = await owned('deliveries?filter=history').expect(200);
    expect(list.body as unknown).toMatchObject({
      total: 1,
      items: [{ status: 'DELIVERED', deliveredAt: body.deliveredAt }],
    });
    expect(findMany.mock.calls).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ where: { customerId: OWNER } })],
      ]),
    );
  });

  it.each(Object.values(ParcelStatus))(
    'preserves current %s and real history without promoting assignment to pickup',
    async (status) => {
      records[0].status = status;
      records[0].statusHistory = [];
      records[0].statusEvents = [
        { id: 'event', status, createdAt: new Date('2026-11-01T00:00:00Z') },
      ];
      const response = await owned('tracking/' + NUMBER).expect(200);
      expect(response.body as unknown).toMatchObject({
        status,
        history: [{ status, occurredAt: '2026-11-01T00:00:00.000Z' }],
      });
      if (status !== 'PICKED_UP')
        expect(response.text).not.toContain('PICKED_UP');
      const publicResponse = await request(app.getHttpServer())
        .get('/api/v1/tracking/' + NUMBER)
        .expect(200);
      expect(publicResponse.body as unknown).toMatchObject({
        status,
        history: [{ status }],
      });
    },
  );

  it('updates the HTTP monthly summary from a persisted courier delivery date when the column is null', async () => {
    const now = new Date();
    const delivered = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    records[0].status = ParcelStatus.DELIVERED;
    records[0].statusEvents = [
      {
        id: 'actual-delivery',
        status: ParcelStatus.DELIVERED,
        createdAt: delivered,
      },
    ];
    const response = await owned('deliveries/summary').expect(200);
    expect(response.body as unknown).toMatchObject({
      activeDeliveries: 0,
      deliveredThisMonth: 1,
      needsAttention: 0,
      reportingMonth: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
      timeZone: 'UTC',
    });
    expect(records[0].deliveredAt).toBeNull();
  });

  it('counts the authoritative courier date at UTC month boundaries without double counting or guessing', async () => {
    const base = fixture();
    const withDelivery = (
      id: string,
      createdAt: string,
    ): StoredCustomerParcel => ({
      ...base,
      id,
      trackingNumber: 'TEST-' + id,
      status: ParcelStatus.DELIVERED,
      deliveredAt: null,
      statusEvents: [
        {
          id: 'event-' + id,
          status: ParcelStatus.DELIVERED,
          createdAt: new Date(createdAt),
        },
      ],
    });
    records = [
      withDelivery('oct', '2026-10-31T23:59:59.999Z'),
      withDelivery('nov', '2026-11-01T00:00:00Z'),
      withDelivery('dec', '2026-12-01T00:00:00Z'),
      {
        ...withDelivery('explicit', '2026-11-10T00:00:00Z'),
        deliveredAt: new Date('2026-10-31T23:59:59.999Z'),
      },
      {
        ...base,
        id: 'missing-date',
        status: ParcelStatus.DELIVERED,
        statusEvents: [],
      },
      {
        ...withDelivery('returned', '2026-11-10T00:00:00Z'),
        status: ParcelStatus.RETURNED,
      },
      {
        ...withDelivery('failed', '2026-11-10T00:00:00Z'),
        status: ParcelStatus.FAILED,
      },
    ];
    records[0].statusHistory = [
      {
        id: 'delayed-mirror',
        status: ParcelStatus.DELIVERED,
        createdAt: new Date('2026-11-01T00:00:00Z'),
      },
    ];
    records[1].statusHistory = [...records[1].statusEvents];
    const user = { id: OWNER, role: Role.CUSTOMER, email: 'test@example.test' };
    await expect(
      history.getCustomerSummary(user, new Date('2026-11-20T00:00:00Z')),
    ).resolves.toMatchObject({
      deliveredThisMonth: 1,
      needsAttention: 2,
      timeZone: 'UTC',
    });
    await expect(
      history.getCustomerSummary(user, new Date('2026-12-01T00:00:00Z')),
    ).resolves.toMatchObject({
      deliveredThisMonth: 1,
      reportingMonth: '2026-12',
    });
  });

  it('keeps owner-scoped tracking/history reads and legacy public rejection intact', async () => {
    await owned('tracking/' + NUMBER, OTHER).expect(404);
    const list = await owned('deliveries', OTHER).expect(200);
    expect(list.body as unknown).toMatchObject({ items: [], total: 0 });
    await request(app.getHttpServer())
      .get('/api/v1/customer/tracking/' + NUMBER)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/tracking/SD-21011')
      .expect(404);
    expect(findUnique).not.toHaveBeenCalled();
    // Fail closed even if a broken storage mock returns another owner's record.
    findMany.mockResolvedValueOnce(records);
    await owned('tracking/' + NUMBER, OTHER).expect(404);
  });
});
