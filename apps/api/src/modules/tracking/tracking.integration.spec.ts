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
import { ParcelsService } from '../parcels/parcels.service.js';
import { UsersService } from '../users/users.service.js';
import type { StoredCustomerParcel } from './adapters/parcel-record.mapper.js';
import { TrackingModule } from './tracking.module.js';

const SECRET = 'tracking-integration-test-secret-at-least-32-bytes';
const OWNER = 'a2ca2a7c-8659-4c04-8c15-73e53c1188af';
const OTHER = 'b2ca2a7c-8659-4c04-8c15-73e53c1188af';
const ROOT = '/api/v1/customer';

describe('Private tracking/history HTTP integration (isolated persistence)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let records: StoredCustomerParcel[];
  let parcels: {
    listForCustomerTracking: jest.Mock<
      Promise<StoredCustomerParcel[]>,
      [string]
    >;
    listForCustomer: jest.Mock<Promise<StoredCustomerParcel[]>, [string]>;
  };
  let users: { findById: jest.Mock };

  function fixture(
    index: number,
    status: ParcelStatus,
    customerId = OWNER,
  ): StoredCustomerParcel {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    return {
      id: `${customerId === OWNER ? 'a' : 'b'}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      customerId,
      trackingNumber: `SD-${String(10000 + index)}`,
      senderAddress: 'Private pickup address',
      recipientAddress: 'Private destination address',
      status,
      deliveredAt: status === ParcelStatus.DELIVERED ? new Date() : null,
      createdAt,
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      statusEvents: [],
      statusHistory: [
        {
          id: `history-${index}`,
          status: ParcelStatus.PENDING,
          createdAt,
        },
      ],
    };
  }

  beforeAll(async () => {
    parcels = {
      listForCustomerTracking: jest.fn<
        Promise<StoredCustomerParcel[]>,
        [string]
      >(),
      listForCustomer: jest.fn<Promise<StoredCustomerParcel[]>, [string]>(),
    };
    users = { findById: jest.fn() };
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
      .overrideProvider(ParcelsService)
      .useValue(parcels)
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    jwt = module.get(JwtService);
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
    records = [
      fixture(1, ParcelStatus.PENDING),
      fixture(2, ParcelStatus.PICKED_UP),
      fixture(3, ParcelStatus.IN_TRANSIT),
      fixture(4, ParcelStatus.OUT_FOR_DELIVERY),
      fixture(5, ParcelStatus.DELIVERED),
      fixture(6, ParcelStatus.FAILED),
      fixture(7, ParcelStatus.RETURNED),
      fixture(99, ParcelStatus.IN_TRANSIT, OTHER),
    ];
    parcels.listForCustomerTracking.mockReset();
    parcels.listForCustomerTracking.mockImplementation((customerId) =>
      Promise.resolve(
        records.filter((record) => record.customerId === customerId),
      ),
    );
    parcels.listForCustomer.mockReset();
    parcels.listForCustomer.mockImplementation((customerId) =>
      Promise.resolve(
        records.filter((record) => record.customerId === customerId),
      ),
    );
    users.findById.mockReset();
    users.findById.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        isActive: true,
        approvalStatus: ApprovalStatus.APPROVED,
      }),
    );
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  function token(
    role: Role = Role.CUSTOMER,
    id = OWNER,
    expiresIn: number = 900,
  ): string {
    return jwt.sign(
      {
        sub: id,
        email: 'test@example.test',
        role,
        approvalStatus: ApprovalStatus.APPROVED,
      },
      { expiresIn },
    );
  }

  function get(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set('Cookie', `${AUTH_COOKIE_NAME}=${token()}`);
  }

  it('renders owned tracking with recorded history through actual JWT cookie auth', async () => {
    const response = await get(`${ROOT}/tracking/SD-10001`).expect(200);
    const body: unknown = response.body;
    expect(body).toEqual({
      id: records[0].id,
      trackingNumber: 'SD-10001',
      status: 'PENDING',
      origin: 'Private pickup address',
      destination: 'Private destination address',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      history: [{ status: 'PENDING', occurredAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(parcels.listForCustomerTracking.mock.calls).toEqual([[OWNER]]);
    expect(response.text).not.toMatch(
      /Internal|Private Sender|Private Recipient|Private Phone|costLkr|customerId/,
    );
  });

  it.each([ParcelStatus.CREATED, ParcelStatus.ASSIGNED])(
    'tracks %s unchanged and includes it in active history and summary',
    async (status) => {
      const parcel = fixture(8, status);
      parcel.statusHistory = [{ ...parcel.statusHistory[0], status }];
      records.push(parcel);

      const tracked = await get(
        `${ROOT}/tracking/${parcel.trackingNumber}`,
      ).expect(200);
      expect(tracked.body as unknown).toMatchObject({
        status,
        history: [{ status, occurredAt: '2026-01-01T00:00:00.000Z' }],
      });
      expect(tracked.text).not.toContain('PICKED_UP');

      const active = await get(
        `${ROOT}/deliveries?filter=active&search=${parcel.trackingNumber}`,
      ).expect(200);
      expect(active.body as unknown).toMatchObject({
        items: [{ trackingNumber: parcel.trackingNumber, status }],
        total: 1,
      });
      const history = await get(
        `${ROOT}/deliveries?filter=history&search=${parcel.trackingNumber}`,
      ).expect(200);
      expect(history.body as unknown).toMatchObject({ items: [], total: 0 });
      const summary = await get(`${ROOT}/deliveries/summary`).expect(200);
      expect(summary.body as unknown).toMatchObject({
        activeDeliveries: 5,
        deliveredThisMonth: 1,
        needsAttention: 2,
      });
    },
  );

  it('does not invent an assignment or pickup event when only booking history exists', async () => {
    records[0].status = ParcelStatus.ASSIGNED;
    const response = await get(`${ROOT}/tracking/SD-10001`).expect(200);
    expect(response.body as unknown).toMatchObject({
      status: 'ASSIGNED',
      history: [{ status: 'PENDING', occurredAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(response.text).not.toContain('PICKED_UP');
  });

  it('normalizes lowercase and surrounding whitespace from path parameters', async () => {
    await get(`${ROOT}/tracking/${encodeURIComponent('  sd-10001  ')}`).expect(
      200,
    );
  });

  it('uses identical 404 responses for absent and other-owned tracking numbers', async () => {
    const missing = await get(`${ROOT}/tracking/SD-99998`).expect(404);
    const other = await get(`${ROOT}/tracking/SD-10099`).expect(404);
    expect(missing.body as unknown).toEqual(other.body as unknown);
    expect(parcels.listForCustomerTracking.mock.calls).toEqual([
      [OWNER],
      [OWNER],
    ]);
  });

  it('does not accept an ownership override on tracking paths', async () => {
    await get(`${ROOT}/tracking/SD-10099?customerId=${OTHER}`).expect(404);
    expect(parcels.listForCustomerTracking.mock.calls).toEqual([[OWNER]]);
  });

  it.each(['SD%2F10001', 'SD_10001', '---'])(
    'rejects invalid tracking input %s before the storage service',
    async (number) => {
      await get(`${ROOT}/tracking/${number}`).expect(400);
      expect(parcels.listForCustomerTracking.mock.calls).toHaveLength(0);
    },
  );

  it('requires a tracking-number path segment', async () => {
    await get(`${ROOT}/tracking`).expect(404);
  });

  it('returns the requested history envelope without changing the existing parcel array endpoint', async () => {
    const response = await get(`${ROOT}/deliveries`).expect(200);
    expect(response.body as unknown).toMatchObject({
      page: 1,
      pageSize: 5,
      total: 7,
    });
    const body = response.body as { items: { id: string }[] };
    expect(body.items).toHaveLength(5);
    expect(body.items.map(({ id }) => id)).toEqual(
      records
        .slice(2, 7)
        .reverse()
        .map(({ id }) => id),
    );
    const legacy = await get('/api/v1/parcels/me').expect(200);
    expect(Array.isArray(legacy.body)).toBe(true);
    expect(legacy.body as unknown[]).toHaveLength(7);
  });

  it.each([
    ['active', ['PENDING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']],
    ['history', ['DELIVERED', 'FAILED', 'RETURNED']],
  ])(
    'filters %s without collapsing returned and failed outcomes',
    async (filter, expected) => {
      const response = await get(
        `${ROOT}/deliveries?filter=${filter}&pageSize=100`,
      ).expect(200);
      const body = response.body as {
        items: { status: string }[];
        total: number;
      };
      expect(body.items.map(({ status }) => status).sort()).toEqual(
        [...expected].sort(),
      );
      expect(body.total).toBe(expected.length);
    },
  );

  it('searches within the selected filter, trims case, and paginates after filtering', async () => {
    const search = encodeURIComponent('  sd-1000  ');
    const response = await get(
      `${ROOT}/deliveries?filter=history&search=${search}&page=2&pageSize=2`,
    ).expect(200);
    const body = response.body as {
      items: { status: string }[];
      page: number;
      pageSize: number;
      total: number;
    };
    expect(body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(body.items.map(({ status }) => status)).toEqual(['DELIVERED']);
    const empty = await get(
      `${ROOT}/deliveries?filter=active&search=SD-10006`,
    ).expect(200);
    expect(empty.body as unknown).toMatchObject({ items: [], total: 0 });
    const beyond = await get(`${ROOT}/deliveries?page=10`).expect(200);
    expect(beyond.body as unknown).toEqual({
      items: [],
      total: 7,
      page: 10,
      pageSize: 5,
    });
  });

  it('reports persisted counts with UTC months and FAILED plus RETURNED attention', async () => {
    const response = await get(`${ROOT}/deliveries/summary`).expect(200);
    const now = new Date();
    expect(response.body as unknown).toEqual({
      activeDeliveries: 4,
      deliveredThisMonth: 1,
      needsAttention: 2,
      reportingMonth: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
      timeZone: 'UTC',
    });
  });

  it('returns confirmed empty accounts rather than sample deliveries', async () => {
    records = [];
    const list = await get(`${ROOT}/deliveries`).expect(200);
    expect(list.body as unknown).toEqual({
      items: [],
      page: 1,
      pageSize: 5,
      total: 0,
    });
    const summary = await get(`${ROOT}/deliveries/summary`).expect(200);
    expect(summary.body as unknown).toMatchObject({
      activeDeliveries: 0,
      deliveredThisMonth: 0,
      needsAttention: 0,
    });
  });

  it.each([
    'filter=invalid',
    'page=0',
    'page=-1',
    'page=1.5',
    'page=1e2',
    'pageSize=101',
    'pageSize=0',
    `customerId=${OTHER}`,
    'filter=active&filter=history',
    'page=1&page=2',
    `search=${'a'.repeat(65)}`,
  ])(
    'rejects invalid history query %s before storage access',
    async (query) => {
      await get(`${ROOT}/deliveries?${query}`).expect(400);
      expect(parcels.listForCustomerTracking.mock.calls).toHaveLength(0);
    },
  );

  const privatePaths = [
    `${ROOT}/tracking/SD-10001`,
    `${ROOT}/deliveries`,
    `${ROOT}/deliveries/summary`,
  ];
  it.each(privatePaths)('requires authentication for %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
    expect(parcels.listForCustomerTracking.mock.calls).toHaveLength(0);
  });

  it.each([Role.MERCHANT, Role.COURIER, Role.ADMIN, Role.DISPATCHER])(
    'rejects %s on every private route',
    async (role) => {
      for (const path of privatePaths) {
        await request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${token(role)}`)
          .expect(403);
      }
      expect(parcels.listForCustomerTracking.mock.calls).toHaveLength(0);
    },
  );

  it.each([ApprovalStatus.PENDING, ApprovalStatus.REJECTED])(
    'checks the live %s approval even when JWT claims approval',
    async (approvalStatus) => {
      users.findById.mockResolvedValue({
        id: OWNER,
        isActive: true,
        approvalStatus,
      });
      for (const path of privatePaths) await get(path).expect(403);
      expect(parcels.listForCustomerTracking.mock.calls).toHaveLength(0);
    },
  );

  it('rejects inactive, missing, expired, and forged sessions', async () => {
    users.findById.mockResolvedValueOnce({
      id: OWNER,
      isActive: false,
      approvalStatus: ApprovalStatus.APPROVED,
    });
    await get(`${ROOT}/deliveries`).expect(401);
    users.findById.mockResolvedValueOnce(null);
    await get(`${ROOT}/deliveries`).expect(401);
    await request(app.getHttpServer())
      .get(`${ROOT}/deliveries`)
      .set('Authorization', `Bearer ${token(Role.CUSTOMER, OWNER, -1)}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`${ROOT}/deliveries`)
      .set('Authorization', 'Bearer forged')
      .expect(401);
    expect(parcels.listForCustomerTracking.mock.calls).toHaveLength(0);
  });

  it('keeps legacy numbers private and does not register receipt downloads or streams', async () => {
    for (const path of [
      '/api/v1/tracking/SD-10001',
      '/api/v1/tracking/SD-10001/stream',
      `/api/v1/parcels/${records[0].id}/receipt`,
    ]) {
      await get(path).expect(404);
    }
  });
});
