import {
  Controller,
  Get,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppController } from '../../app.controller.js';
import { AppService } from '../../app.service.js';
import { Role, ApprovalStatus } from '../../generated/prisma/enums.js';
import { UsersService } from '../users/users.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { Roles } from './decorators/roles.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PasswordService } from './password.service.js';
import type { AuthenticatedUser } from './decorators/current-user.decorator.js';

const TEST_SECRET = 'this-is-a-test-secret-that-is-at-least-32-bytes-long!';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}

@Controller('test-role')
class TestRoleController {
  @Public()
  @Get('public')
  publicEndpoint() {
    return { message: 'public-ok' };
  }

  @Get('authenticated')
  anyAuthenticated(@CurrentUser() user: AuthenticatedUser) {
    return { message: 'authenticated-ok', userId: user.id, role: user.role };
  }

  @Roles(Role.ADMIN)
  @Get('admin-only')
  adminOnly(@CurrentUser() user: AuthenticatedUser) {
    return { message: 'admin-ok', role: user.role };
  }

  @Roles(Role.ADMIN, Role.DISPATCHER)
  @Get('admin-or-dispatcher')
  adminOrDispatcher(@CurrentUser() user: AuthenticatedUser) {
    return { message: 'staff-ok', role: user.role };
  }
}

describe('Global Authentication and Authorization (Integration)', () => {
  let app: INestApplication<App>;
  let usersService: { findById: jest.Mock; findByEmail: jest.Mock };

  beforeAll(async () => {
    usersService = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: TEST_SECRET,
              JWT_ACCESS_TTL: '15m',
            }),
          ],
        }),
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: {
            algorithm: 'HS256',
            expiresIn: '15m',
          },
        }),
      ],
      controllers: [AppController, AuthController, TestRoleController],
      providers: [
        AppService,
        AuthService,
        PasswordService,
        { provide: UsersService, useValue: usersService },
        // Execution order: JwtAuthGuard first, then RolesGuard
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
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

  const getHttpApp = () => app.getHttpServer();

  const createToken = (
    payload: object,
    options?: jwt.SignOptions,
    secret = TEST_SECRET,
  ): string => {
    return jwt.sign(payload, secret, {
      algorithm: 'HS256',
      expiresIn: '15m',
      ...options,
    });
  };

  describe('Public endpoints bypass authentication', () => {
    it('GET / allows unauthenticated access (marked @Public)', async () => {
      const res = await request(getHttpApp()).get('/').expect(200);
      expect(res.text).toBe('Hello World!');
    });

    it('GET /test-role/public allows unauthenticated access (marked @Public)', async () => {
      const res = await request(getHttpApp())
        .get('/test-role/public')
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body).toEqual({ message: 'public-ok' });
    });

    it('POST /auth/login bypasses auth guard (returns 400 validation error for invalid body, not 401)', async () => {
      const res = await request(getHttpApp())
        .post('/auth/login')
        .send({})
        .expect(400);

      const body = res.body as ErrorResponse;
      expect(body.message).toContain('A valid email address is required');
    });
  });

  describe('Protected endpoints authentication enforcement', () => {
    it('GET /auth/me rejects request without token with 401 Unauthorized', async () => {
      const res = await request(getHttpApp()).get('/auth/me').expect(401);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Missing authorization token');
    });

    it('GET /test-role/authenticated rejects request without token with 401', async () => {
      const res = await request(getHttpApp())
        .get('/test-role/authenticated')
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Missing authorization token');
    });

    it('GET /auth/me rejects malformed authorization header with 401', async () => {
      const res = await request(getHttpApp())
        .get('/auth/me')
        .set('Authorization', 'Basic invalid-credentials')
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe(
        'Malformed authorization header. Expected Bearer <token>',
      );
    });

    it('GET /auth/me rejects expired token with 401', async () => {
      const expiredToken = createToken(
        { sub: 'user-1', email: 'user@example.com', role: Role.CUSTOMER },
        { expiresIn: '-1s' },
      );

      const res = await request(getHttpApp())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Invalid or expired authorization token');
    });

    it('GET /auth/me rejects token signed with wrong secret with 401', async () => {
      const forgedToken = createToken(
        { sub: 'user-1', email: 'user@example.com', role: Role.CUSTOMER },
        {},
        'different-secret-that-is-at-least-32-chars-long!',
      );

      const res = await request(getHttpApp())
        .get('/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`)
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Invalid or expired authorization token');
    });

    it('GET /auth/me rejects token missing required claims (sub or role) with 401', async () => {
      const incompleteToken = createToken({
        email: 'user@example.com',
      });

      const res = await request(getHttpApp())
        .get('/auth/me')
        .set('Authorization', `Bearer ${incompleteToken}`)
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Token payload is missing required claims');
    });
  });

  describe('JWT algorithm restriction (HS256 pinning)', () => {
    it('rejects tokens signed with "none" algorithm with 401', async () => {
      const noneToken = jwt.sign(
        { sub: 'user-1', email: 'user@example.com', role: Role.ADMIN },
        '',
        { algorithm: 'none' },
      );

      const res = await request(getHttpApp())
        .get('/auth/me')
        .set('Authorization', `Bearer ${noneToken}`)
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Invalid or expired authorization token');
    });

    it('accepts tokens signed with HS256', async () => {
      usersService.findById.mockResolvedValue({
        id: 'user-uuid-123',
        email: 'customer@example.com',
        fullName: 'Jane Doe',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      });

      const validToken = createToken({
        sub: 'user-uuid-123',
        email: 'customer@example.com',
        role: Role.CUSTOMER,
      });

      const res = await request(getHttpApp())
        .get('/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body['id']).toBe('user-uuid-123');
      expect(body['email']).toBe('customer@example.com');
      expect(body['fullName']).toBe('Jane Doe');
      expect(body['role']).toBe(Role.CUSTOMER);
      expect(body['approvalStatus']).toBe(ApprovalStatus.APPROVED);
      expect(body['isActive']).toBe(true);
      expect(typeof body['createdAt']).toBe('string');
      expect(typeof body['updatedAt']).toBe('string');
    });
  });

  describe('Global role authorization', () => {
    it('allows any authenticated role on endpoints without @Roles() metadata', async () => {
      const customerToken = createToken({
        sub: 'cust-1',
        email: 'cust@example.com',
        role: Role.CUSTOMER,
      });

      const res = await request(getHttpApp())
        .get('/test-role/authenticated')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual({
        message: 'authenticated-ok',
        userId: 'cust-1',
        role: Role.CUSTOMER,
      });
    });

    it('allows access when user has the required role', async () => {
      const adminToken = createToken({
        sub: 'admin-1',
        email: 'admin@example.com',
        role: Role.ADMIN,
      });

      const res = await request(getHttpApp())
        .get('/test-role/admin-only')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual({
        message: 'admin-ok',
        role: Role.ADMIN,
      });
    });

    it('rejects access with 403 Forbidden when user does not have the required role', async () => {
      const customerToken = createToken({
        sub: 'cust-1',
        email: 'cust@example.com',
        role: Role.CUSTOMER,
      });

      const res = await request(getHttpApp())
        .get('/test-role/admin-only')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Forbidden resource: insufficient permissions');
    });

    it('allows access when user has one of several permitted roles', async () => {
      const dispatcherToken = createToken({
        sub: 'disp-1',
        email: 'dispatcher@example.com',
        role: Role.DISPATCHER,
      });

      const res = await request(getHttpApp())
        .get('/test-role/admin-or-dispatcher')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual({
        message: 'staff-ok',
        role: Role.DISPATCHER,
      });
    });

    it('unauthenticated request to a role-protected route is rejected with 401, not 403 (proving guard execution order)', async () => {
      const res = await request(getHttpApp())
        .get('/test-role/admin-only')
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Missing authorization token');
    });
  });
});
