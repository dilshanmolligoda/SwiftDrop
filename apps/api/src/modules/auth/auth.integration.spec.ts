import {
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
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
import {
  Role,
  ApprovalStatus,
  VehicleType,
} from '../../generated/prisma/enums.js';
import { UsersService } from '../users/users.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { Roles } from './decorators/roles.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { ApprovalGuard } from './guards/approval.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { PasswordService } from './password.service.js';
import {
  cookieParserMiddleware,
  AUTH_COOKIE_NAME,
} from './utils/cookie.util.js';
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

  @Roles(Role.ADMIN)
  @Post('admin-post')
  @HttpCode(HttpStatus.OK)
  adminPost(@CurrentUser() user: AuthenticatedUser) {
    return { message: 'admin-post-ok', role: user.role };
  }

  @Roles(Role.ADMIN, Role.DISPATCHER)
  @Get('admin-or-dispatcher')
  adminOrDispatcher(@CurrentUser() user: AuthenticatedUser) {
    return { message: 'staff-ok', role: user.role };
  }
}

describe('Global Authentication and Authorization (Integration)', () => {
  let app: INestApplication<App>;
  let usersService: {
    findById: jest.Mock;
    findByEmail: jest.Mock;
    createCustomer: jest.Mock;
    createMerchant: jest.Mock;
    createCourier: jest.Mock;
  };
  let passwordService: PasswordService;

  beforeAll(async () => {
    usersService = {
      findById: jest.fn().mockImplementation((id: string) =>
        Promise.resolve({
          id,
          email: `${id}@swiftdrop.local`,
          fullName: 'Default Approved User',
          role: Role.ADMIN,
          approvalStatus: ApprovalStatus.APPROVED,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      ),
      findByEmail: jest.fn(),
      createCustomer: jest.fn(),
      createMerchant: jest.fn(),
      createCourier: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              NODE_ENV: 'development',
              JWT_ACCESS_SECRET: TEST_SECRET,
              JWT_ACCESS_TTL: '15m',
              CORS_ORIGINS: 'http://localhost:5173',
              AUTH_COOKIE_PATH: '/api',
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
        // Execution order: CsrfGuard first, then JwtAuthGuard, then ApprovalGuard, then RolesGuard
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ApprovalGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    passwordService = moduleFixture.get<PasswordService>(PasswordService);

    app = moduleFixture.createNestApplication();
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

  describe('Login, Cookie Setting & Response Body Sanitization', () => {
    it('sets HTTP-only cookie on successful login and never exposes JWT in JSON response', async () => {
      const passwordHash = await passwordService.hash('valid-pass-123');
      usersService.findByEmail.mockResolvedValue({
        id: 'user-login-1',
        email: 'dispatcher@swiftdrop.local',
        fullName: 'Demo Dispatcher',
        passwordHash,
        role: Role.DISPATCHER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
      });

      const res = await request(getHttpApp())
        .post('/auth/login')
        .send({
          email: 'dispatcher@swiftdrop.local',
          password: 'valid-pass-123',
        })
        .expect(200);

      const body = res.body as Record<string, unknown>;
      // Verify JSON body does NOT expose accessToken
      expect(body['accessToken']).toBeUndefined();
      expect(body['expiresIn']).toBe(900);
      expect(body['user']).toEqual({
        id: 'user-login-1',
        email: 'dispatcher@swiftdrop.local',
        fullName: 'Demo Dispatcher',
        role: Role.DISPATCHER,
        approvalStatus: ApprovalStatus.APPROVED,
      });

      // Verify Set-Cookie header contains HTTP-only cookie with correct attributes
      const setCookieHeader = res.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader.join('; ')
        : String(setCookieHeader);

      expect(cookieStr).toContain(`${AUTH_COOKIE_NAME}=`);
      expect(cookieStr).toMatch(/httponly/i);
      expect(cookieStr).toMatch(/samesite=lax/i);
      expect(cookieStr).toMatch(/path=\/api/i);
    });

    it('does not set authentication cookie when credentials are invalid', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const res = await request(getHttpApp())
        .post('/auth/login')
        .send({
          email: 'nonexistent@swiftdrop.local',
          password: 'wrong-pass',
        })
        .expect(401);

      expect(res.headers['set-cookie']).toBeUndefined();
      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Invalid email or password');
    });

    it('does not set authentication cookie and returns generic 401 when account is inactive', async () => {
      const passwordHash = await passwordService.hash('valid-pass-123');
      usersService.findByEmail.mockResolvedValue({
        id: 'user-inactive-1',
        email: 'inactive@swiftdrop.local',
        passwordHash,
        role: Role.CUSTOMER,
        isActive: false,
      });

      const res = await request(getHttpApp())
        .post('/auth/login')
        .send({
          email: 'inactive@swiftdrop.local',
          password: 'valid-pass-123',
        })
        .expect(401);

      expect(res.headers['set-cookie']).toBeUndefined();
      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Invalid email or password');
    });
  });

  describe('Cookie-based authentication on protected routes', () => {
    it('authenticates successfully using HTTP-only cookie on GET /auth/me', async () => {
      const validCookieToken = createToken({
        sub: 'cookie-user-1',
        email: 'cookie@swiftdrop.local',
        role: Role.CUSTOMER,
      });

      usersService.findById.mockResolvedValue({
        id: 'cookie-user-1',
        email: 'cookie@swiftdrop.local',
        fullName: 'Cookie Customer',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      });

      const res = await request(getHttpApp())
        .get('/auth/me')
        .set('Cookie', `${AUTH_COOKIE_NAME}=${validCookieToken}`)
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body['id']).toBe('cookie-user-1');
      expect(body['email']).toBe('cookie@swiftdrop.local');
      expect(body['fullName']).toBe('Cookie Customer');
      expect(body['role']).toBe(Role.CUSTOMER);
    });

    it('rejects expired cookie with 401', async () => {
      const expiredToken = createToken(
        {
          sub: 'cookie-user-1',
          email: 'cookie@swiftdrop.local',
          role: Role.CUSTOMER,
        },
        { expiresIn: '-1s' },
      );

      const res = await request(getHttpApp())
        .get('/auth/me')
        .set('Cookie', `${AUTH_COOKIE_NAME}=${expiredToken}`)
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Invalid or expired authorization token');
    });

    it('rejects invalid/tampered cookie with 401', async () => {
      const res = await request(getHttpApp())
        .get('/auth/me')
        .set('Cookie', `${AUTH_COOKIE_NAME}=tampered.token.value`)
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Invalid or expired authorization token');
    });

    it('allows access to role-protected endpoint using cookie authentication', async () => {
      const adminCookieToken = createToken({
        sub: 'admin-cookie-1',
        email: 'admin@swiftdrop.local',
        role: Role.ADMIN,
      });

      const res = await request(getHttpApp())
        .get('/test-role/admin-only')
        .set('Cookie', `${AUTH_COOKIE_NAME}=${adminCookieToken}`)
        .expect(200);

      expect(res.body).toEqual({
        message: 'admin-ok',
        role: Role.ADMIN,
      });
    });

    it('enforces role authorization on cookie-authenticated requests with insufficient role', async () => {
      const customerCookieToken = createToken({
        sub: 'cust-cookie-1',
        email: 'customer@swiftdrop.local',
        role: Role.CUSTOMER,
      });

      const res = await request(getHttpApp())
        .get('/test-role/admin-only')
        .set('Cookie', `${AUTH_COOKIE_NAME}=${customerCookieToken}`)
        .expect(403);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Forbidden resource: insufficient permissions');
    });
  });

  describe('Logout functionality', () => {
    it('POST /auth/logout clears the authentication cookie with matching path', async () => {
      const res = await request(getHttpApp()).post('/auth/logout').expect(200);

      expect(res.body).toEqual({ message: 'Logged out successfully' });

      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieStr = Array.isArray(setCookie)
        ? setCookie.join('; ')
        : String(setCookie);

      // Verify cookie is cleared (empty value and expired / max-age=0)
      expect(cookieStr).toContain(`${AUTH_COOKIE_NAME}=;`);
      expect(cookieStr).toMatch(/path=\/api/i);
      expect(cookieStr).toMatch(/httponly/i);
    });
  });

  describe('CSRF / Origin header validation on state-changing requests', () => {
    it('rejects POST request with unauthorized Origin header with 403 Forbidden', async () => {
      const res = await request(getHttpApp())
        .post('/auth/login')
        .set('Origin', 'http://malicious-attacker.com')
        .send({
          email: 'dispatcher@swiftdrop.local',
          password: 'pass',
        })
        .expect(403);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe(
        'Cross-origin request rejected: unauthorized origin',
      );
    });

    it('rejects cookie-authenticated POST with an unapproved Origin with 403 Forbidden', async () => {
      const validCookieToken = createToken({
        sub: 'cookie-user-1',
        email: 'cookie@swiftdrop.local',
        role: Role.CUSTOMER,
      });

      const res = await request(getHttpApp())
        .post('/auth/logout')
        .set('Origin', 'http://malicious-site.com')
        .set('Cookie', `${AUTH_COOKIE_NAME}=${validCookieToken}`)
        .expect(403);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe(
        'Cross-origin request rejected: unauthorized origin',
      );
    });

    it('rejects cookie-authenticated POST without Origin and Referer with 403 Forbidden', async () => {
      const validCookieToken = createToken({
        sub: 'cookie-user-1',
        email: 'cookie@swiftdrop.local',
        role: Role.CUSTOMER,
      });

      const res = await request(getHttpApp())
        .post('/auth/logout')
        .set('Cookie', `${AUTH_COOKIE_NAME}=${validCookieToken}`)
        .expect(403);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe(
        'Cross-origin request rejected: missing origin for cookie-authenticated request',
      );
    });

    it('allows cookie-authenticated POST with an approved Origin', async () => {
      const validCookieToken = createToken({
        sub: 'cookie-user-1',
        email: 'cookie@swiftdrop.local',
        role: Role.CUSTOMER,
      });

      const res = await request(getHttpApp())
        .post('/auth/logout')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', `${AUTH_COOKIE_NAME}=${validCookieToken}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Logged out successfully' });
    });

    it('allows non-browser Bearer-token POST without Origin and Referer to pass CSRF and reach JWT auth', async () => {
      const adminToken = createToken({
        sub: 'admin-1',
        email: 'admin@example.com',
        role: Role.ADMIN,
      });

      const res = await request(getHttpApp())
        .post('/test-role/admin-post')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body).toEqual({
        message: 'admin-post-ok',
        role: Role.ADMIN,
      });
    });

    it('preserves existing safe HTTP methods (GET) regardless of Origin', async () => {
      const res = await request(getHttpApp())
        .get('/test-role/public')
        .set('Origin', 'http://unapproved-origin.com')
        .expect(200);

      expect(res.body).toEqual({ message: 'public-ok' });
    });
  });

  describe('Protected endpoints authentication enforcement (Bearer token compatibility)', () => {
    it('GET /auth/me rejects request without token or cookie with 401 Unauthorized', async () => {
      const res = await request(getHttpApp()).get('/auth/me').expect(401);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe('Missing authorization token');
    });

    it('GET /test-role/authenticated rejects request without token or cookie with 401', async () => {
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

    it('GET /auth/me rejects expired Bearer token with 401', async () => {
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

    it('accepts tokens signed with HS256 via Bearer token', async () => {
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

  describe('Global role authorization via Bearer token', () => {
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

  describe('User Registration Endpoints', () => {
    describe('POST /auth/register/customer', () => {
      it('successfully registers customer, sets HTTP-only cookie, and returns safe user summary', async () => {
        usersService.findByEmail.mockResolvedValueOnce(null);
        usersService.createCustomer.mockResolvedValueOnce({
          id: 'new-cust-id',
          email: 'newcustomer@swiftdrop.local',
          fullName: 'New Customer',
          phoneNumber: '+94771234567',
          passwordHash: '$2b$12$fakeHash',
          role: Role.CUSTOMER,
          approvalStatus: ApprovalStatus.APPROVED,
          isActive: true,
          googleSubject: null,
          reviewedAt: null,
          reviewedBy: null,
          rejectionReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const res = await request(getHttpApp())
          .post('/auth/register/customer')
          .set('Origin', 'http://localhost:5173')
          .send({
            fullName: 'New Customer',
            email: 'newcustomer@swiftdrop.local',
            phoneNumber: '0771234567',
            password: 'ValidPassword123!',
          })
          .expect(201);

        const body = res.body as Record<string, unknown>;
        expect(body['accessToken']).toBeUndefined();
        expect(body['expiresIn']).toBe(900);
        expect(body['user']).toEqual({
          id: 'new-cust-id',
          email: 'newcustomer@swiftdrop.local',
          fullName: 'New Customer',
          role: Role.CUSTOMER,
          approvalStatus: ApprovalStatus.APPROVED,
        });

        const setCookieHeader = res.headers['set-cookie'];
        expect(setCookieHeader).toBeDefined();
        const cookieStr = Array.isArray(setCookieHeader)
          ? setCookieHeader.join('; ')
          : String(setCookieHeader);
        expect(cookieStr).toContain(AUTH_COOKIE_NAME);
        expect(cookieStr.toLowerCase()).toContain('httponly');
      });

      it('rejects registration with HTTP 400 when password is under 12 characters', async () => {
        const res = await request(getHttpApp())
          .post('/auth/register/customer')
          .set('Origin', 'http://localhost:5173')
          .send({
            fullName: 'Short Pass User',
            email: 'shortpass@swiftdrop.local',
            phoneNumber: '0771234567',
            password: 'short',
          })
          .expect(400);

        const body = res.body as ErrorResponse;
        expect(Array.isArray(body.message)).toBe(true);
        expect(
          (body.message as string[]).some((m) =>
            m.includes('at least 12 characters'),
          ),
        ).toBe(true);
      });

      it('rejects registration with HTTP 409 Conflict when email is already registered', async () => {
        usersService.findByEmail.mockResolvedValueOnce({
          id: 'existing-id',
          email: 'existing@swiftdrop.local',
          fullName: 'Existing User',
          passwordHash: '$2b$12$fake',
          role: Role.CUSTOMER,
          approvalStatus: ApprovalStatus.APPROVED,
          isActive: true,
        });

        const res = await request(getHttpApp())
          .post('/auth/register/customer')
          .set('Origin', 'http://localhost:5173')
          .send({
            fullName: 'Duplicate Email User',
            email: 'existing@swiftdrop.local',
            phoneNumber: '0771234567',
            password: 'ValidPassword123!',
          })
          .expect(409);

        const body = res.body as ErrorResponse;
        expect(body.message).toBe(
          'An account with this email address already exists',
        );
      });
    });

    describe('POST /auth/register/merchant', () => {
      it('successfully registers merchant with PENDING approval status', async () => {
        usersService.findByEmail.mockResolvedValueOnce(null);
        usersService.createMerchant.mockResolvedValueOnce({
          id: 'new-merch-id',
          email: 'merchant@swiftdrop.local',
          fullName: 'Store Owner',
          phoneNumber: '+94711234567',
          role: Role.MERCHANT,
          approvalStatus: ApprovalStatus.PENDING,
          isActive: true,
          merchantProfile: {
            id: 'profile-id',
            userId: 'new-merch-id',
            businessName: 'Apex Store',
            businessAddress: '123 Galle Rd, Colombo',
            businessType: 'Retail',
          },
        });

        const res = await request(getHttpApp())
          .post('/auth/register/merchant')
          .set('Origin', 'http://localhost:5173')
          .send({
            fullName: 'Store Owner',
            email: 'merchant@swiftdrop.local',
            phoneNumber: '0711234567',
            password: 'ValidPassword123!',
            businessName: 'Apex Store',
            businessAddress: '123 Galle Rd, Colombo',
            businessType: 'Retail',
          })
          .expect(201);

        const body = res.body as Record<string, unknown>;
        expect(body['user']).toEqual({
          id: 'new-merch-id',
          email: 'merchant@swiftdrop.local',
          fullName: 'Store Owner',
          role: Role.MERCHANT,
          approvalStatus: ApprovalStatus.PENDING,
        });
      });
    });

    describe('POST /auth/register/courier', () => {
      it('registers motorized courier with license plate and driving licence', async () => {
        usersService.findByEmail.mockResolvedValueOnce(null);
        usersService.createCourier.mockResolvedValueOnce({
          id: 'new-courier-id',
          email: 'rider@swiftdrop.local',
          fullName: 'Express Rider',
          phoneNumber: '+94751234567',
          role: Role.COURIER,
          approvalStatus: ApprovalStatus.PENDING,
          isActive: true,
          courierProfile: {
            id: 'courier-profile-id',
            userId: 'new-courier-id',
            vehicleType: VehicleType.MOTORCYCLE,
            licensePlate: 'WP-BEE-5544',
            licenseNumber: 'DL99887766',
          },
        });

        const res = await request(getHttpApp())
          .post('/auth/register/courier')
          .set('Origin', 'http://localhost:5173')
          .send({
            fullName: 'Express Rider',
            email: 'rider@swiftdrop.local',
            phoneNumber: '0751234567',
            password: 'ValidPassword123!',
            vehicleType: VehicleType.MOTORCYCLE,
            licensePlate: 'WP-BEE-5544',
            licenseNumber: 'DL99887766',
          })
          .expect(201);

        const body = res.body as Record<string, unknown>;
        expect(body['user']).toEqual({
          id: 'new-courier-id',
          email: 'rider@swiftdrop.local',
          fullName: 'Express Rider',
          role: Role.COURIER,
          approvalStatus: ApprovalStatus.PENDING,
        });
      });

      it('rejects motorized courier with HTTP 400 when licensePlate is missing', async () => {
        const res = await request(getHttpApp())
          .post('/auth/register/courier')
          .set('Origin', 'http://localhost:5173')
          .send({
            fullName: 'Incomplete Rider',
            email: 'incompleterider@swiftdrop.local',
            phoneNumber: '0751234567',
            password: 'ValidPassword123!',
            vehicleType: VehicleType.MOTORCYCLE,
            licenseNumber: 'DL99887766',
          })
          .expect(400);

        const body = res.body as ErrorResponse;
        expect(
          (body.message as string[]).some((m) =>
            m.includes('Vehicle registration number is required'),
          ),
        ).toBe(true);
      });

      it('registers bicycle courier without requiring plate or licence', async () => {
        usersService.findByEmail.mockResolvedValueOnce(null);
        usersService.createCourier.mockResolvedValueOnce({
          id: 'bike-courier-id',
          email: 'biker@swiftdrop.local',
          fullName: 'Bike Courier',
          phoneNumber: '+94751234567',
          role: Role.COURIER,
          approvalStatus: ApprovalStatus.PENDING,
          isActive: true,
        });

        const res = await request(getHttpApp())
          .post('/auth/register/courier')
          .set('Origin', 'http://localhost:5173')
          .send({
            fullName: 'Bike Courier',
            email: 'biker@swiftdrop.local',
            phoneNumber: '0751234567',
            password: 'ValidPassword123!',
            vehicleType: VehicleType.BICYCLE,
          })
          .expect(201);

        const body = res.body as Record<string, unknown>;
        expect(body['user']).toEqual({
          id: 'bike-courier-id',
          email: 'biker@swiftdrop.local',
          fullName: 'Bike Courier',
          role: Role.COURIER,
          approvalStatus: ApprovalStatus.PENDING,
        });
      });
    });
  });

  describe('Approval Status and Restricted Session Behavior', () => {
    it('GET /auth/application-status returns status details for authenticated applicant', async () => {
      const pendingToken = createToken({
        sub: 'pending-merch-1',
        email: 'applicant@swiftdrop.local',
        role: Role.MERCHANT,
        approvalStatus: ApprovalStatus.PENDING,
      });

      const pendingApplicant = {
        id: 'pending-merch-1',
        email: 'applicant@swiftdrop.local',
        fullName: 'Pending Applicant',
        role: Role.MERCHANT,
        approvalStatus: ApprovalStatus.PENDING,
        isActive: true,
        createdAt: new Date('2026-03-01T08:00:00Z'),
        reviewedAt: null,
        rejectionReason: null,
      };
      usersService.findById.mockResolvedValue(pendingApplicant);

      const res = await request(getHttpApp())
        .get('/auth/application-status')
        .set('Authorization', `Bearer ${pendingToken}`)
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body['approvalStatus']).toBe(ApprovalStatus.PENDING);
      expect(body['status']).toBe(ApprovalStatus.PENDING);
      expect(body['role']).toBe(Role.MERCHANT);
      expect(body['submittedAt']).toBeDefined();
      expect(body['reviewedAt']).toBeNull();
      expect(body['rejectionReason']).toBeNull();
      expect(body['reviewedBy']).toBeUndefined();
    });

    it('PENDING applicant CAN access GET /auth/me without 403 Forbidden', async () => {
      const pendingToken = createToken({
        sub: 'pending-courier-1',
        email: 'pendingcourier@swiftdrop.local',
        role: Role.COURIER,
        approvalStatus: ApprovalStatus.PENDING,
      });

      const pendingCourier = {
        id: 'pending-courier-1',
        email: 'pendingcourier@swiftdrop.local',
        fullName: 'Pending Courier',
        role: Role.COURIER,
        approvalStatus: ApprovalStatus.PENDING,
        isActive: true,
        createdAt: new Date('2026-03-01T08:00:00Z'),
        updatedAt: new Date('2026-03-01T08:00:00Z'),
      };
      usersService.findById.mockResolvedValue(pendingCourier);

      const res = await request(getHttpApp())
        .get('/auth/me')
        .set('Authorization', `Bearer ${pendingToken}`)
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body['approvalStatus']).toBe(ApprovalStatus.PENDING);
    });

    it('PENDING applicant is BLOCKED with 403 Forbidden when trying to access normal protected routes', async () => {
      const pendingToken = createToken({
        sub: 'pending-courier-1',
        email: 'pendingcourier@swiftdrop.local',
        role: Role.COURIER,
        approvalStatus: ApprovalStatus.PENDING,
      });

      usersService.findById.mockResolvedValueOnce({
        id: 'pending-courier-1',
        email: 'pendingcourier@swiftdrop.local',
        fullName: 'Pending Courier',
        role: Role.COURIER,
        approvalStatus: ApprovalStatus.PENDING,
        isActive: true,
      });

      const res = await request(getHttpApp())
        .get('/test-role/authenticated')
        .set('Authorization', `Bearer ${pendingToken}`)
        .expect(403);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe(
        'Account approval is required to access this resource',
      );
    });

    it('REJECTED applicant is BLOCKED with 403 Forbidden when trying to access normal protected routes', async () => {
      const rejectedToken = createToken({
        sub: 'rejected-merch-1',
        email: 'rejected@swiftdrop.local',
        role: Role.MERCHANT,
        approvalStatus: ApprovalStatus.REJECTED,
      });

      usersService.findById.mockResolvedValueOnce({
        id: 'rejected-merch-1',
        email: 'rejected@swiftdrop.local',
        fullName: 'Rejected Merchant',
        role: Role.MERCHANT,
        approvalStatus: ApprovalStatus.REJECTED,
        isActive: true,
      });

      const res = await request(getHttpApp())
        .get('/test-role/authenticated')
        .set('Authorization', `Bearer ${rejectedToken}`)
        .expect(403);

      const body = res.body as ErrorResponse;
      expect(body.message).toBe(
        'Account approval is required to access this resource',
      );
    });

    it('APPROVED user can access normal protected routes', async () => {
      const approvedToken = createToken({
        sub: 'approved-user-1',
        email: 'approved@swiftdrop.local',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
      });

      usersService.findById.mockResolvedValueOnce({
        id: 'approved-user-1',
        email: 'approved@swiftdrop.local',
        fullName: 'Approved Customer',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
      });

      const res = await request(getHttpApp())
        .get('/test-role/authenticated')
        .set('Authorization', `Bearer ${approvedToken}`)
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body['message']).toBe('authenticated-ok');
    });
  });
});
