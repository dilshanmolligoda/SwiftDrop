/* eslint-disable @typescript-eslint/no-unsafe-member-access -- supertest bodies are typed `any` */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { MerchantWebhooksModule } from './merchant-webhooks.module.js';
import { HOST_RESOLVER } from './webhook-target.policy.js';

const SECRET = 'merchant-webhooks-integration-secret-32-bytes!';
const MERCHANT = '66666666-6666-4666-8666-666666666666';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const ORIGIN = 'http://localhost:5173';

describe('Merchant webhook API (integration)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const rows = new Map<string, Record<string, unknown>>();

  // In-memory stand-in for the two tables this module touches.
  const prisma = {
    webhookEndpoint: {
      findUnique: jest.fn(({ where }: { where: { merchantUserId: string } }) =>
        Promise.resolve(rows.get(where.merchantUserId) ?? null),
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: 'endpoint-1',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rows.set(data.merchantUserId as string, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { merchantUserId: string };
          data: Record<string, unknown>;
        }) => {
          const row = { ...rows.get(where.merchantUserId), ...data };
          rows.set(where.merchantUserId, row);
          return Promise.resolve(row);
        },
      ),
    },
    webhookDelivery: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    ),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_ACCESS_SECRET: SECRET,
              CORS_ORIGINS: ORIGIN,
              WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString(
                'base64',
              ),
            }),
          ],
        }),
        JwtModule.register({ secret: SECRET }),
        MerchantWebhooksModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(HOST_RESOLVER)
      .useValue((host: string) =>
        Promise.resolve(
          host === 'shop.example' ? ['93.184.216.34'] : ['10.0.0.9'],
        ),
      )
      .compile();

    jwt = module.get(JwtService);
    app = module.createNestApplication();
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

  afterAll(() => app.close());
  beforeEach(() => rows.clear());

  const token = (id: string, role: Role) =>
    jwt.signAsync({ sub: id, email: `${id}@example.test`, role });
  const asMerchant = async () =>
    `Bearer ${await token(MERCHANT, Role.MERCHANT)}`;

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/merchant/webhook')
      .expect(401);
  });

  it('is only for merchants', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/merchant/webhook')
      .set('Authorization', `Bearer ${await token(CUSTOMER, Role.CUSTOMER)}`)
      .expect(403);
  });

  it('creates a webhook, returns the secret once, then never again', async () => {
    const auth = await asMerchant();

    const created = await request(app.getHttpServer())
      .put('/api/v1/merchant/webhook')
      .set('Authorization', auth)
      .set('Origin', ORIGIN)
      .send({ url: 'https://shop.example/hooks' })
      .expect(200);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body).toMatchObject({
      configured: true,
      url: 'https://shop.example/hooks',
      isActive: true,
    });
    expect(created.body.signingSecret).toMatch(/^whsec_/);
    expect(created.body).not.toHaveProperty('secretEncrypted');

    const read = await request(app.getHttpServer())
      .get('/api/v1/merchant/webhook')
      .set('Authorization', auth)
      .expect(200);
    expect(read.body).not.toHaveProperty('signingSecret');
    expect(read.body).not.toHaveProperty('secretEncrypted');
    expect(read.body.secretHint).toBe(
      `…${(created.body.signingSecret as string).slice(-4)}`,
    );
  });

  it('rejects a URL pointing at a private network', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/merchant/webhook')
      .set('Authorization', await asMerchant())
      .set('Origin', ORIGIN)
      .send({ url: 'https://internal.example/hooks' })
      .expect(400);
    expect(res.body.message).toBe(
      'URL must point to a public internet address',
    );
  });

  it.each([
    [{}, 'missing url'],
    [{ url: 42 }, 'non-string url'],
    [
      { url: 'https://shop.example/x', merchantUserId: CUSTOMER },
      'extra field',
    ],
  ])('validates the body (%s: %s)', async (body) => {
    await request(app.getHttpServer())
      .put('/api/v1/merchant/webhook')
      .set('Authorization', await asMerchant())
      .set('Origin', ORIGIN)
      .send(body)
      .expect(400);
  });

  it('rotates the secret', async () => {
    const auth = await asMerchant();
    const first = await request(app.getHttpServer())
      .put('/api/v1/merchant/webhook')
      .set('Authorization', auth)
      .set('Origin', ORIGIN)
      .send({ url: 'https://shop.example/hooks' });

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/merchant/webhook/rotate-secret')
      .set('Authorization', auth)
      .set('Origin', ORIGIN)
      .expect(200);
    expect(rotated.body.signingSecret).toMatch(/^whsec_/);
    expect(rotated.body.signingSecret).not.toBe(first.body.signingSecret);
  });

  it('rejects state changes from another origin (CSRF)', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/merchant/webhook')
      .set('Authorization', await asMerchant())
      .set('Origin', 'https://evil.example')
      .send({ url: 'https://shop.example/hooks' })
      .expect(403);
  });

  it('validates delivery list paging', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/merchant/webhook/deliveries?pageSize=500')
      .set('Authorization', await asMerchant())
      .expect(400);
  });
});
