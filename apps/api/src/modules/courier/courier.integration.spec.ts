import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Role } from '../../generated/prisma/enums.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CourierModule } from './courier.module.js';

const TEST_SECRET = 'courier-integration-secret-at-least-32-bytes-long';
const COURIER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

describe('Courier API authentication and validation (integration)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  const prismaMock = {
    deliveryAssignment: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    deliveryProof: { findFirst: jest.fn(), create: jest.fn() },
    parcel: { updateMany: jest.fn() },
    parcelStatusEvent: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_ACCESS_SECRET: TEST_SECRET,
              CORS_ORIGINS: 'http://localhost:5173',
              AUTH_COOKIE_PATH: '/api',
            }),
          ],
        }),
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { algorithm: 'HS256' },
        }),
        PrismaModule,
        CourierModule,
      ],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function bearerFor(id: string, role: Role) {
    return jwtService.signAsync({ sub: id, email: `${id}@example.test`, role });
  }

  it('rejects unauthenticated courier requests', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/courier/dashboard')
      .expect(401);
  });

  it('rejects authenticated non-couriers with 403', async () => {
    const token = await bearerFor(CUSTOMER_ID, Role.CUSTOMER);
    await request(app.getHttpServer())
      .get('/api/v1/courier/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows a courier and derives the identity from its authenticated JWT', async () => {
    const token = await bearerFor(COURIER_ID, Role.COURIER);
    prismaMock.deliveryAssignment.count.mockResolvedValue(0);

    const response = await request(app.getHttpServer())
      .get('/api/v1/courier/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      timeZone: 'Asia/Colombo',
      totalAssigned: 0,
      pending: 0,
      pickedUp: 0,
      inTransit: 0,
      outForDelivery: 0,
      delivered: 0,
      failed: 0,
    });
    const firstCountCall = prismaMock.deliveryAssignment.count.mock
      .calls[0] as unknown as [{ where: { courierId: string } }];
    expect(firstCountCall[0].where.courierId).toBe(COURIER_ID);
  });

  it('validates pagination and rejects unknown query parameters', async () => {
    const token = await bearerFor(COURIER_ID, Role.COURIER);
    await request(app.getHttpServer())
      .get('/api/v1/courier/deliveries/today?page=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/courier/deliveries/today?courierId=someone-else')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
