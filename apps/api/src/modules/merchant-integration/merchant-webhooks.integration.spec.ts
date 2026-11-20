import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { App } from 'supertest/types';
import { InMemoryWebhooksRepository } from '../../../test/fakes/in-memory-webhooks.repository.js';
import { ApprovalStatus, Role } from '../../generated/prisma/enums.js';
import { ApprovalGuard } from '../auth/guards/approval.guard.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import {
  AUTH_COOKIE_NAME,
  cookieParserMiddleware,
} from '../auth/utils/cookie.util.js';
import { UsersService } from '../users/users.service.js';
import { MerchantWebhookController } from './controllers/merchant-webhook.controller.js';
import { verifyWebhookSignature } from './domain/webhook-signature.js';
import { MerchantProfilesRepository } from './repositories/merchant-profiles.repository.js';
import { WebhooksRepository } from './repositories/webhooks.repository.js';
import { WebhookDeliveryService } from './services/webhook-delivery.service.js';
import { WebhookEndpointsService } from './services/webhook-endpoints.service.js';
import { WebhookHttpClient } from './services/webhook-http.client.js';
import { WebhookSettings } from './services/webhook-settings.js';

const JWT_SECRET = 'merchant-webhooks-test-secret-at-least-32-bytes';
const ORIGIN = 'http://localhost:5173';

const users = {
  merchantA: {
    id: '11111111-1111-4111-8111-111111111111',
    role: Role.MERCHANT,
    profileId: 'aaaaaaaa-0000-4000-8000-00000000000a',
  },
  merchantB: {
    id: '22222222-2222-4222-8222-222222222222',
    role: Role.MERCHANT,
    profileId: 'bbbbbbbb-0000-4000-8000-00000000000b',
  },
  merchantNoProfile: {
    id: '33333333-3333-4333-8333-333333333333',
    role: Role.MERCHANT,
    profileId: null,
  },
  customer: {
    id: '44444444-4444-4444-8444-444444444444',
    role: Role.CUSTOMER,
    profileId: null,
  },
};
type TestUser = (typeof users)[keyof typeof users];

/** A stand-in merchant server that records what it receives and answers with a chosen status. */
interface Received {
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

describe('Merchant webhooks (integration)', () => {
  let app: INestApplication<App>;
  let repository: InMemoryWebhooksRepository;
  let receiver: Server;
  let receiverUrl: string;
  let received: Received[];
  let receiverStatus: number;

  const cookie = (user: TestUser) =>
    `${AUTH_COOKIE_NAME}=${jwt.sign(
      { sub: user.id, email: 'x@test.local', role: user.role },
      JWT_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '15m',
      },
    )}`;

  const as = (user: TestUser) => {
    const server = app.getHttpServer();
    return {
      get: (url: string) =>
        request(server).get(url).set('Cookie', cookie(user)),
      put: (url: string) =>
        request(server)
          .put(url)
          .set('Cookie', cookie(user))
          .set('Origin', ORIGIN),
      post: (url: string) =>
        request(server)
          .post(url)
          .set('Cookie', cookie(user))
          .set('Origin', ORIGIN),
      delete: (url: string) =>
        request(server)
          .delete(url)
          .set('Cookie', cookie(user))
          .set('Origin', ORIGIN),
    };
  };

  beforeAll(async () => {
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }

    received = [];
    receiverStatus = 200;
    receiver = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(receiverStatus).end();
      });
    });
    await new Promise<void>((resolve) =>
      receiver.listen(0, '127.0.0.1', resolve),
    );
    receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/webhooks/swiftdrop`;

    repository = new InMemoryWebhooksRepository();
    const profilesRepository = {
      findIdByUserId: (userId: string) =>
        Promise.resolve(
          Object.values(users).find((u) => u.id === userId)?.profileId ?? null,
        ),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_ACCESS_SECRET: JWT_SECRET,
              CORS_ORIGINS: ORIGIN,
              WEBHOOK_SECRET_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
              WEBHOOK_TIMEOUT_MS: 2000,
            }),
          ],
        }),
        JwtModule.register({ secret: JWT_SECRET }),
      ],
      controllers: [MerchantWebhookController],
      providers: [
        WebhookEndpointsService,
        WebhookDeliveryService,
        WebhookHttpClient,
        WebhookSettings,
        { provide: WebhooksRepository, useValue: repository },
        { provide: MerchantProfilesRepository, useValue: profilesRepository },
        {
          provide: UsersService,
          useValue: {
            findById: (id: string) =>
              Promise.resolve({
                id,
                isActive: true,
                approvalStatus: ApprovalStatus.APPROVED,
              }),
          },
        },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ApprovalGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
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

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => receiver.close(resolve));
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    received.length = 0;
    receiverStatus = 200;
  });

  it('registers an endpoint and shows the signing secret only once', async () => {
    const created = await as(users.merchantA)
      .put('/merchants/me/webhook')
      .send({ url: receiverUrl })
      .expect(200);
    const body = created.body as {
      endpoint: { url: string };
      signingSecret?: string;
    };
    expect(body.endpoint.url).toBe(receiverUrl);
    expect(body.signingSecret).toMatch(/^whsec_/);
    expect(created.headers['cache-control']).toBe('no-store');

    const read = await as(users.merchantA)
      .get('/merchants/me/webhook')
      .expect(200);
    expect(JSON.stringify(read.body)).not.toContain(body.signingSecret);

    const changed = await as(users.merchantA)
      .put('/merchants/me/webhook')
      .send({ url: receiverUrl })
      .expect(200);
    expect(changed.body).not.toHaveProperty('signingSecret');

    expect(repository.endpoints[0].encryptedSecret).not.toContain(
      body.signingSecret,
    );
  });

  it('sends a signed test event the merchant can verify', async () => {
    const rotated = await as(users.merchantA)
      .post('/merchants/me/webhook/rotate-secret')
      .expect(200);
    const secret = (rotated.body as { signingSecret: string }).signingSecret;

    const res = await as(users.merchantA)
      .post('/merchants/me/webhook/test')
      .expect(202);

    expect(res.body).toMatchObject({
      eventType: 'webhook.test',
      status: 'DELIVERED',
      attemptCount: 1,
    });
    expect(received).toHaveLength(1);
    const { headers, body } = received[0];
    expect(
      verifyWebhookSignature(
        secret,
        headers['x-swiftdrop-timestamp'] as string,
        body,
        headers['x-swiftdrop-signature'] as string,
      ),
    ).toBe(true);
    expect(JSON.parse(body)).toMatchObject({ eventType: 'webhook.test' });
  });

  it('keeps a failed test event queued for retry and shows the attempt in the log', async () => {
    receiverStatus = 500;

    const res = await as(users.merchantA)
      .post('/merchants/me/webhook/test')
      .expect(202);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      lastStatusCode: 500,
      attemptCount: 1,
    });

    const log = await as(users.merchantA)
      .get('/merchants/me/webhook/deliveries')
      .expect(200);
    const latest = (
      log.body as { id: string; attempts: { statusCode: number }[] }[]
    )[0];
    expect(latest.attempts.map((a) => a.statusCode)).toEqual([500]);
  });

  it('can send a failed delivery again', async () => {
    receiverStatus = 404;
    const failed = await as(users.merchantA)
      .post('/merchants/me/webhook/test')
      .expect(202);
    expect(failed.body).toMatchObject({ status: 'FAILED' });

    receiverStatus = 200;
    const id = (failed.body as { id: string }).id;
    const again = await as(users.merchantA)
      .post(`/merchants/me/webhook/deliveries/${id}/redeliver`)
      .expect(202);
    expect(again.body).toMatchObject({ status: 'DELIVERED', attemptCount: 1 });
  });

  it.each([
    ['ftp://example.com/hook', 'Webhook URL must start with https://'],
    ['not a url', 'Webhook URL is not a valid URL'],
  ])('rejects the URL %p with 400', async (url, message) => {
    const res = await as(users.merchantA)
      .put('/merchants/me/webhook')
      .send({ url })
      .expect(400);
    expect((res.body as { message: string }).message).toBe(message);
  });

  describe('authorization', () => {
    it('returns 401 without a session and 403 for a customer', async () => {
      await request(app.getHttpServer())
        .get('/merchants/me/webhook')
        .expect(401);
      await as(users.customer).get('/merchants/me/webhook').expect(403);
      await as(users.customer).post('/merchants/me/webhook/test').expect(403);
    });

    it("does not show or resend merchant A's deliveries to merchant B", async () => {
      const aDeliveries = await as(users.merchantA)
        .get('/merchants/me/webhook/deliveries')
        .expect(200);
      const aId = (aDeliveries.body as { id: string }[])[0].id;

      await as(users.merchantB)
        .put('/merchants/me/webhook')
        .send({ url: receiverUrl })
        .expect(200);
      const bDeliveries = await as(users.merchantB)
        .get('/merchants/me/webhook/deliveries')
        .expect(200);
      expect(bDeliveries.body).toEqual([]);

      await as(users.merchantB)
        .post(`/merchants/me/webhook/deliveries/${aId}/redeliver`)
        .expect(404);
    });

    it('returns 404 for a merchant account without a business profile', async () => {
      await as(users.merchantNoProfile)
        .put('/merchants/me/webhook')
        .send({ url: receiverUrl })
        .expect(404);
    });
  });

  it('removes the endpoint; test events then return 404', async () => {
    await as(users.merchantB).delete('/merchants/me/webhook').expect(204);
    const read = await as(users.merchantB)
      .get('/merchants/me/webhook')
      .expect(200);
    expect(read.body).toEqual({ endpoint: null });
    await as(users.merchantB).post('/merchants/me/webhook/test').expect(404);
  });
});
