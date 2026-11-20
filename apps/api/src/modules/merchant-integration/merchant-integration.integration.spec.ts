import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { ApiKey } from '../../generated/prisma/client.js';
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
import { MerchantApiKeysController } from './controllers/merchant-api-keys.controller.js';
import { MerchantApiController } from './controllers/merchant-api.controller.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import {
  ApiKeysRepository,
  type ApiKeyWithOwner,
  type CreateApiKeyData,
} from './repositories/api-keys.repository.js';
import { ApiKeysService } from './services/api-keys.service.js';

const JWT_SECRET = 'merchant-integration-test-secret-at-least-32-bytes';
const ORIGIN = 'http://localhost:5173';

interface TestUser {
  id: string;
  role: Role;
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  merchantProfile?: { id: string; businessName: string };
}

const users: Record<string, TestUser> = {
  merchantA: {
    id: '11111111-1111-4111-8111-111111111111',
    role: Role.MERCHANT,
    approvalStatus: ApprovalStatus.APPROVED,
    isActive: true,
    merchantProfile: {
      id: 'aaaaaaaa-0000-4000-8000-00000000000a',
      businessName: 'Store A',
    },
  },
  merchantB: {
    id: '22222222-2222-4222-8222-222222222222',
    role: Role.MERCHANT,
    approvalStatus: ApprovalStatus.APPROVED,
    isActive: true,
    merchantProfile: {
      id: 'bbbbbbbb-0000-4000-8000-00000000000b',
      businessName: 'Store B',
    },
  },
  pendingMerchant: {
    id: '33333333-3333-4333-8333-333333333333',
    role: Role.MERCHANT,
    approvalStatus: ApprovalStatus.PENDING,
    isActive: true,
    merchantProfile: {
      id: 'cccccccc-0000-4000-8000-00000000000c',
      businessName: 'Store C',
    },
  },
  customer: {
    id: '44444444-4444-4444-8444-444444444444',
    role: Role.CUSTOMER,
    approvalStatus: ApprovalStatus.APPROVED,
    isActive: true,
  },
};

/** In-memory stand-in for the Prisma-backed repository. */
class InMemoryApiKeysRepository {
  readonly keys: ApiKey[] = [];
  private nextId = 1;

  private profiles() {
    return Object.values(users).filter((u) => u.merchantProfile);
  }

  findMerchantProfileIdByUserId(userId: string) {
    return Promise.resolve(
      this.profiles().find((u) => u.id === userId)?.merchantProfile?.id ?? null,
    );
  }

  countActive(merchantProfileId: string) {
    return Promise.resolve(
      this.keys.filter(
        (k) => k.merchantProfileId === merchantProfileId && !k.revokedAt,
      ).length,
    );
  }

  create(data: CreateApiKeyData) {
    const key: ApiKey = {
      id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`,
      ...data,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.keys.push(key);
    return Promise.resolve(key);
  }

  listByMerchant(merchantProfileId: string) {
    return Promise.resolve(
      this.keys.filter((k) => k.merchantProfileId === merchantProfileId),
    );
  }

  findByIdForMerchant(id: string, merchantProfileId: string) {
    return Promise.resolve(
      this.keys.find(
        (k) => k.id === id && k.merchantProfileId === merchantProfileId,
      ) ?? null,
    );
  }

  revoke(id: string, revokedAt: Date) {
    const key = this.keys.find((k) => k.id === id)!;
    key.revokedAt = revokedAt;
    return Promise.resolve(key);
  }

  findByPrefixWithOwner(keyPrefix: string): Promise<ApiKeyWithOwner | null> {
    const key = this.keys.find((k) => k.keyPrefix === keyPrefix);
    const owner = this.profiles().find(
      (u) => u.merchantProfile!.id === key?.merchantProfileId,
    );
    if (!key || !owner) return Promise.resolve(null);
    return Promise.resolve({
      ...key,
      merchantProfile: {
        id: owner.merchantProfile!.id,
        businessName: owner.merchantProfile!.businessName,
        user: {
          id: owner.id,
          isActive: owner.isActive,
          approvalStatus: owner.approvalStatus,
        },
      },
    });
  }

  touchLastUsed(id: string, usedAt: Date) {
    this.keys.find((k) => k.id === id)!.lastUsedAt = usedAt;
    return Promise.resolve();
  }
}

describe('Merchant API keys (integration)', () => {
  let app: INestApplication<App>;
  let repository: InMemoryApiKeysRepository;

  const sessionCookie = (user: TestUser) =>
    `${AUTH_COOKIE_NAME}=${jwt.sign(
      { sub: user.id, email: `${user.id}@test.local`, role: user.role },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' },
    )}`;

  /** A signed-in browser request: session cookie plus the app's Origin, as the CSRF guard expects. */
  const asUser = (user: TestUser) => ({
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set('Cookie', sessionCookie(user)),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Cookie', sessionCookie(user))
        .set('Origin', ORIGIN),
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Cookie', sessionCookie(user))
        .set('Origin', ORIGIN),
  });

  const createKey = async (user: TestUser, name = 'Online store') => {
    const res = await asUser(user)
      .post('/merchants/me/api-keys')
      .send({ name })
      .expect(201);
    return res.body as { id: string; apiKey: string; keyPrefix: string };
  };

  beforeAll(async () => {
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
    repository = new InMemoryApiKeysRepository();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: JWT_SECRET,
              CORS_ORIGINS: ORIGIN,
              API_KEY_PEPPER: 'integration-test-pepper',
            }),
          ],
        }),
        JwtModule.register({ secret: JWT_SECRET }),
      ],
      controllers: [MerchantApiKeysController, MerchantApiController],
      providers: [
        ApiKeysService,
        ApiKeyGuard,
        { provide: ApiKeysRepository, useValue: repository },
        {
          provide: UsersService,
          useValue: {
            findById: (id: string) =>
              Promise.resolve(
                Object.values(users).find((u) => u.id === id) ?? null,
              ),
          },
        },
        // Same global guard order as AppModule
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
    jest.restoreAllMocks();
  });

  describe('managing keys (signed-in merchant)', () => {
    it('creates a key, shows it once and stores only its hash', async () => {
      const res = await asUser(users.merchantA)
        .post('/merchants/me/api-keys')
        .send({ name: '  Online store  ' })
        .expect(201);

      const body = res.body as Record<string, unknown>;
      expect(res.headers['cache-control']).toBe('no-store');
      expect(body.name).toBe('Online store');
      expect(typeof body.apiKey).toBe('string');
      expect(body).not.toHaveProperty('keyHash');

      const stored = repository.keys.find((k) => k.id === body.id)!;
      expect(stored.keyHash).not.toContain(body.apiKey as string);
    });

    it('lists keys without the full key or hash', async () => {
      const res = await asUser(users.merchantA)
        .get('/merchants/me/api-keys')
        .expect(200);

      const keys = res.body as Record<string, unknown>[];
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key).not.toHaveProperty('apiKey');
        expect(key).not.toHaveProperty('keyHash');
      }
    });

    it('rejects an empty or unknown body field with 400', async () => {
      await asUser(users.merchantA)
        .post('/merchants/me/api-keys')
        .send({ name: '   ' })
        .expect(400);
      await asUser(users.merchantA)
        .post('/merchants/me/api-keys')
        .send({
          name: 'ok',
          merchantProfileId: users.merchantB.merchantProfile!.id,
        })
        .expect(400);
    });

    it('returns 400 for a revoke id that is not a UUID', async () => {
      await asUser(users.merchantA)
        .delete('/merchants/me/api-keys/not-a-uuid')
        .expect(400);
    });
  });

  describe('authorization', () => {
    it('returns 401 without a session', async () => {
      await request(app.getHttpServer())
        .get('/merchants/me/api-keys')
        .expect(401);
    });

    it('returns 403 for a customer', async () => {
      await asUser(users.customer).get('/merchants/me/api-keys').expect(403);
    });

    it('returns 403 for a merchant who is not approved yet', async () => {
      await asUser(users.pendingMerchant)
        .get('/merchants/me/api-keys')
        .expect(403);
    });

    it("does not let merchant B see or revoke merchant A's key", async () => {
      const keyA = await createKey(users.merchantA, 'A only');

      const listB = await asUser(users.merchantB)
        .get('/merchants/me/api-keys')
        .expect(200);
      expect((listB.body as { id: string }[]).map((k) => k.id)).not.toContain(
        keyA.id,
      );

      await asUser(users.merchantB)
        .delete(`/merchants/me/api-keys/${keyA.id}`)
        .expect(404);
      expect(
        repository.keys.find((k) => k.id === keyA.id)!.revokedAt,
      ).toBeNull();
    });

    it('rejects a cookie-authenticated create from another website (CSRF)', async () => {
      await request(app.getHttpServer())
        .post('/merchants/me/api-keys')
        .set('Cookie', sessionCookie(users.merchantA))
        .set('Origin', 'https://evil.example')
        .send({ name: 'Stolen' })
        .expect(403);
    });
  });

  describe('merchant API with X-API-Key', () => {
    it('authenticates a merchant server by key alone (no cookie, no Origin)', async () => {
      const key = await createKey(users.merchantB, 'Store B server');

      const res = await request(app.getHttpServer())
        .get('/merchant-api/me')
        .set('X-API-Key', key.apiKey)
        .expect(200);

      expect(res.body).toEqual({
        merchantId: users.merchantB.merchantProfile!.id,
        businessName: 'Store B',
        apiKeyPrefix: key.keyPrefix,
      });
      expect(
        repository.keys.find((k) => k.id === key.id)!.lastUsedAt,
      ).toBeInstanceOf(Date);
    });

    it('returns 401 without the header, with a malformed key or with a wrong key', async () => {
      const key = await createKey(users.merchantA, 'For tampering');
      const server = app.getHttpServer();

      await request(server).get('/merchant-api/me').expect(401);
      await request(server)
        .get('/merchant-api/me')
        .set('X-API-Key', 'hello')
        .expect(401);
      await request(server)
        .get('/merchant-api/me')
        .set('X-API-Key', key.apiKey.slice(0, -4) + 'AAAA')
        .expect(401);
    });

    it('does not accept a browser session in place of an API key', async () => {
      await asUser(users.merchantA).get('/merchant-api/me').expect(401);
    });

    it('returns 401 once the key is revoked', async () => {
      const key = await createKey(users.merchantA, 'To revoke');
      await request(app.getHttpServer())
        .get('/merchant-api/me')
        .set('X-API-Key', key.apiKey)
        .expect(200);

      await asUser(users.merchantA)
        .delete(`/merchants/me/api-keys/${key.id}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/merchant-api/me')
        .set('X-API-Key', key.apiKey)
        .expect(401);
      expect((res.body as { message: string }).message).toBe(
        'API key has been revoked',
      );
    });

    it('returns 403 when the merchant who owns the key is no longer approved', async () => {
      const key = await createKey(users.merchantB, 'Before suspension');
      users.merchantB.approvalStatus = ApprovalStatus.REJECTED;
      try {
        await request(app.getHttpServer())
          .get('/merchant-api/me')
          .set('X-API-Key', key.apiKey)
          .expect(403);
      } finally {
        users.merchantB.approvalStatus = ApprovalStatus.APPROVED;
      }
    });

    it('caps a merchant at 5 active keys', async () => {
      const merchant = users.merchantB;
      const active = await repository.countActive(merchant.merchantProfile!.id);
      for (let i = active; i < 5; i++) {
        await createKey(merchant, `Key ${i}`);
      }

      await asUser(merchant)
        .post('/merchants/me/api-keys')
        .send({ name: 'One too many' })
        .expect(409);
    });
  });
});
