import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Role, ApprovalStatus } from '../../generated/prisma/enums.js';
import { UsersService } from '../users/users.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GoogleAuthService } from './google-auth.service.js';
import { PasswordService } from './password.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { ApprovalGuard } from './guards/approval.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import {
  cookieParserMiddleware,
  AUTH_COOKIE_NAME,
  OAUTH_TX_COOKIE_NAME,
} from './utils/cookie.util.js';

const TEST_SECRET = 'this-is-a-test-secret-that-is-at-least-32-bytes-long!';
const WEB_APP_URL = 'http://localhost:5173';

describe('Google OAuth 2.0 (Integration)', () => {
  let app: INestApplication<App>;
  let usersService: {
    findById: jest.Mock;
    findByEmail: jest.Mock;
    findByGoogleSubject: jest.Mock;
    createGoogleCustomer: jest.Mock;
    linkGoogleSubject: jest.Mock;
  };
  let googleAuthService: GoogleAuthService;
  let authService: AuthService;

  interface MockUser {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    approvalStatus: ApprovalStatus;
    isActive: boolean;
    googleSubject: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  let usersDb: Map<string, MockUser>;

  beforeAll(async () => {
    usersDb = new Map();

    usersService = {
      findById: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(usersDb.get(id) ?? null);
      }),
      findByEmail: jest.fn().mockImplementation((email: string) => {
        const normalized = email.trim().toLowerCase();
        for (const user of usersDb.values()) {
          if (user.email.toLowerCase() === normalized) {
            return Promise.resolve(user);
          }
        }
        return Promise.resolve(null);
      }),
      findByGoogleSubject: jest
        .fn()
        .mockImplementation((googleSubject: string) => {
          for (const user of usersDb.values()) {
            if (user.googleSubject === googleSubject) {
              return Promise.resolve(user);
            }
          }
          return Promise.resolve(null);
        }),
      createGoogleCustomer: jest
        .fn()
        .mockImplementation(
          (data: {
            email: string;
            fullName: string;
            googleSubject: string;
          }) => {
            const id = `user-${Date.now()}-${Math.random()}`;
            const newUser: MockUser = {
              id,
              email: data.email.trim().toLowerCase(),
              fullName: data.fullName.trim(),
              googleSubject: data.googleSubject,
              role: Role.CUSTOMER,
              approvalStatus: ApprovalStatus.APPROVED,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            usersDb.set(id, newUser);
            return Promise.resolve(newUser);
          },
        ),
      linkGoogleSubject: jest
        .fn()
        .mockImplementation((userId: string, googleSubject: string) => {
          const user = usersDb.get(userId);
          if (!user) throw new Error('User not found');
          user.googleSubject = googleSubject;
          return Promise.resolve(user);
        }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_ACCESS_SECRET: TEST_SECRET,
              JWT_ACCESS_TTL: '15m',
              CORS_ORIGINS: 'http://localhost:5173',
              WEB_APP_URL: 'http://localhost:5173',
              GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
              GOOGLE_CLIENT_SECRET: 'test-client-secret',
              GOOGLE_CALLBACK_URL:
                'http://localhost:4000/api/v1/auth/google/callback',
            }),
          ],
        }),
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        GoogleAuthService,
        PasswordService,
        { provide: UsersService, useValue: usersService },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ApprovalGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParserMiddleware);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    googleAuthService = moduleFixture.get<GoogleAuthService>(GoogleAuthService);
    authService = moduleFixture.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    usersDb.clear();
    jest.clearAllMocks();
  });

  const getHttpApp = () => app.getHttpServer();

  describe('GET /auth/google (Initiation)', () => {
    it('redirects to Google authorization URL and sets signed OAuth transaction cookie', async () => {
      const response = await request(getHttpApp())
        .get('/auth/google')
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toContain(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(response.headers.location).toContain(
        'client_id=test-client-id.apps.googleusercontent.com',
      );
      expect(response.headers.location).toContain('code_challenge=');

      const setCookie = response.headers['set-cookie'] as unknown as string[];
      expect(setCookie).toBeDefined();
      const txCookie = setCookie.find((c) =>
        c.startsWith(`${OAUTH_TX_COOKIE_NAME}=`),
      );
      expect(txCookie).toBeDefined();
      expect(txCookie).toContain('HttpOnly');
      expect(txCookie).toContain('SameSite=Lax');
    });

    it('redirects to login with controlled error if Google credentials are not configured', async () => {
      jest.spyOn(googleAuthService, 'isConfigured').mockReturnValueOnce(false);

      const response = await request(getHttpApp())
        .get('/auth/google')
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/login?error=google_not_configured`,
      );
    });
  });

  describe('GET /auth/google/link (Link Initiation)', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      await request(getHttpApp())
        .get('/auth/google/link')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('creates an authenticated link transaction cookie when session is valid', async () => {
      const user: MockUser = {
        id: 'user-to-link-1',
        email: 'customer@example.com',
        fullName: 'Existing Customer',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(user.id, user);

      const session = await authService.createAuthSession(user);

      const response = await request(getHttpApp())
        .get('/auth/google/link')
        .set('Cookie', [`${AUTH_COOKIE_NAME}=${session.accessToken}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toContain(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );

      const setCookie = response.headers['set-cookie'] as unknown as string[];
      const txCookieHeader = setCookie.find((c) =>
        c.startsWith(`${OAUTH_TX_COOKIE_NAME}=`),
      );
      expect(txCookieHeader).toBeDefined();

      const cookieVal = txCookieHeader!
        .split(';')[0]
        .replace(`${OAUTH_TX_COOKIE_NAME}=`, '');
      const tx = googleAuthService.verifyTransactionCookie(cookieVal);
      expect(tx).not.toBeNull();
      expect(tx?.intent).toBe('link');
      expect(tx?.linkUserId).toBe(user.id);
    });
  });

  describe('GET /auth/google/callback (Sign-in Flow)', () => {
    it('redirects to /login?error=oauth_missing_state when transaction cookie is missing', async () => {
      const response = await request(getHttpApp())
        .get('/auth/google/callback?code=some-code&state=some-state')
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/login?error=oauth_missing_state`,
      );
    });

    it('redirects to /login?error=oauth_invalid_state when state does not match cookie', async () => {
      const { cookieValue } =
        googleAuthService.createOAuthTransaction('signin');

      const response = await request(getHttpApp())
        .get(
          '/auth/google/callback?code=some-code&state=tampered-or-different-state',
        )
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/login?error=oauth_invalid_state`,
      );
    });

    it('redirects to /login?error=oauth_invalid_state when OAuth error response has invalid or missing state', async () => {
      const { cookieValue } =
        googleAuthService.createOAuthTransaction('signin');

      // 1. Missing state with error
      const responseMissing = await request(getHttpApp())
        .get('/auth/google/callback?error=access_denied')
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(responseMissing.headers.location).toBe(
        `${WEB_APP_URL}/login?error=oauth_invalid_state`,
      );

      // 2. Mismatched state with error
      const responseMismatched = await request(getHttpApp())
        .get('/auth/google/callback?error=access_denied&state=wrong-state')
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(responseMismatched.headers.location).toBe(
        `${WEB_APP_URL}/login?error=oauth_invalid_state`,
      );
    });

    it('redirects to /login?error=access_denied when user cancels consent', async () => {
      const { cookieValue, authUrl } =
        googleAuthService.createOAuthTransaction('signin');
      const state = new URL(authUrl).searchParams.get('state')!;

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?error=access_denied&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/login?error=access_denied`,
      );
    });

    it('authenticates existing linked Google user, preserves role & approval, and redirects to dashboard', async () => {
      const existingUser: MockUser = {
        id: 'admin-user-uuid',
        email: 'admin@swiftdrop.local',
        fullName: 'Admin User',
        role: Role.ADMIN,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: 'google-sub-admin-999',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(existingUser.id, existingUser);

      const { cookieValue, authUrl } =
        googleAuthService.createOAuthTransaction('signin');
      const state = new URL(authUrl).searchParams.get('state')!;

      jest.spyOn(googleAuthService, 'exchangeAndVerify').mockResolvedValueOnce({
        googleSubject: 'google-sub-admin-999',
        email: 'admin@swiftdrop.local',
        fullName: 'Admin User',
        emailVerified: true,
      });

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?code=valid-code&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(`${WEB_APP_URL}/admin-landing`);

      const setCookie = response.headers['set-cookie'] as unknown as string[];
      const authCookie = setCookie.find((c) =>
        c.startsWith(`${AUTH_COOKIE_NAME}=`),
      );
      expect(authCookie).toBeDefined();
      expect(authCookie).toContain('HttpOnly');
    });

    it('preserves PENDING approval status and redirects to /application-status for existing linked user', async () => {
      const pendingMerchant: MockUser = {
        id: 'merchant-uuid',
        email: 'merchant@swiftdrop.local',
        fullName: 'Pending Merchant',
        role: Role.MERCHANT,
        approvalStatus: ApprovalStatus.PENDING,
        isActive: true,
        googleSubject: 'google-sub-merchant-888',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(pendingMerchant.id, pendingMerchant);

      const { cookieValue, authUrl } =
        googleAuthService.createOAuthTransaction('signin');
      const state = new URL(authUrl).searchParams.get('state')!;

      jest.spyOn(googleAuthService, 'exchangeAndVerify').mockResolvedValueOnce({
        googleSubject: 'google-sub-merchant-888',
        email: 'merchant@swiftdrop.local',
        fullName: 'Pending Merchant',
        emailVerified: true,
      });

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?code=valid-code&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/application-status`,
      );
    });

    it('rejects deactivated linked Google user with /login?error=account_deactivated', async () => {
      const inactiveUser: MockUser = {
        id: 'inactive-user-uuid',
        email: 'inactive@example.com',
        fullName: 'Inactive User',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: false,
        googleSubject: 'google-sub-inactive',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(inactiveUser.id, inactiveUser);

      const { cookieValue, authUrl } =
        googleAuthService.createOAuthTransaction('signin');
      const state = new URL(authUrl).searchParams.get('state')!;

      jest.spyOn(googleAuthService, 'exchangeAndVerify').mockResolvedValueOnce({
        googleSubject: 'google-sub-inactive',
        email: 'inactive@example.com',
        fullName: 'Inactive User',
        emailVerified: true,
      });

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?code=valid-code&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/login?error=account_deactivated`,
      );
    });

    it('does NOT automatically link when verified email matches an unlinked account, redirecting to login with message', async () => {
      const unlinkedUser: MockUser = {
        id: 'unlinked-customer-uuid',
        email: 'manual@example.com',
        fullName: 'Manual Customer',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(unlinkedUser.id, unlinkedUser);

      const { cookieValue, authUrl } =
        googleAuthService.createOAuthTransaction('signin');
      const state = new URL(authUrl).searchParams.get('state')!;

      jest.spyOn(googleAuthService, 'exchangeAndVerify').mockResolvedValueOnce({
        googleSubject: 'new-google-sub-for-manual-user',
        email: 'manual@example.com',
        fullName: 'Manual Customer Via Google',
        emailVerified: true,
      });

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?code=valid-code&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/login?error=account_exists_link_required`,
      );
      expect(unlinkedUser.googleSubject).toBeNull();
      expect(usersService.createGoogleCustomer).not.toHaveBeenCalled();
    });

    it('creates a new approved CUSTOMER when no account exists, sets cookie, and redirects to /customer/dashboard', async () => {
      const { cookieValue, authUrl } =
        googleAuthService.createOAuthTransaction('signin');
      const state = new URL(authUrl).searchParams.get('state')!;

      jest.spyOn(googleAuthService, 'exchangeAndVerify').mockResolvedValueOnce({
        googleSubject: 'brand-new-google-sub',
        email: 'brandnew@example.com',
        fullName: 'Brand New User',
        emailVerified: true,
      });

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?code=valid-code&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/customer/dashboard`,
      );
      expect(usersService.createGoogleCustomer).toHaveBeenCalledWith({
        email: 'brandnew@example.com',
        fullName: 'Brand New User',
        googleSubject: 'brand-new-google-sub',
      });

      const setCookie = response.headers['set-cookie'] as unknown as string[];
      const authCookie = setCookie.find((c) =>
        c.startsWith(`${AUTH_COOKIE_NAME}=`),
      );
      expect(authCookie).toBeDefined();
    });
  });

  describe('GET /auth/google/callback (Authenticated Linking Flow)', () => {
    it('successfully links Google identity when verified email matches current authenticated user', async () => {
      const user: MockUser = {
        id: 'link-me-uuid',
        email: 'linkme@example.com',
        fullName: 'Link Me',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(user.id, user);

      const { cookieValue, authUrl } = googleAuthService.createOAuthTransaction(
        'link',
        user.id,
      );
      const state = new URL(authUrl).searchParams.get('state')!;

      jest.spyOn(googleAuthService, 'exchangeAndVerify').mockResolvedValueOnce({
        googleSubject: 'new-google-sub-for-linkme',
        email: 'linkme@example.com',
        fullName: 'Link Me On Google',
        emailVerified: true,
      });

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?code=valid-code&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/customer/dashboard?link_success=google_connected`,
      );
      expect(usersService.linkGoogleSubject).toHaveBeenCalledWith(
        user.id,
        'new-google-sub-for-linkme',
      );
      expect(user.googleSubject).toBe('new-google-sub-for-linkme');
    });

    it('rejects linking when Google verified email does not match authenticated user email', async () => {
      const user: MockUser = {
        id: 'user-diff-email',
        email: 'primary@example.com',
        fullName: 'User Primary',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(user.id, user);

      const { cookieValue, authUrl } = googleAuthService.createOAuthTransaction(
        'link',
        user.id,
      );
      const state = new URL(authUrl).searchParams.get('state')!;

      jest.spyOn(googleAuthService, 'exchangeAndVerify').mockResolvedValueOnce({
        googleSubject: 'sub-different-email',
        email: 'totally.different@example.com',
        fullName: 'Different Google User',
        emailVerified: true,
      });

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?code=valid-code&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/customer/dashboard?link_error=email_mismatch`,
      );
      expect(usersService.linkGoogleSubject).not.toHaveBeenCalled();
    });

    it('rejects linking when Google identity is already linked to another account', async () => {
      const otherUser: MockUser = {
        id: 'other-user-uuid',
        email: 'other@example.com',
        fullName: 'Other User',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: 'already-used-google-sub',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(otherUser.id, otherUser);

      const currentUser: MockUser = {
        id: 'current-user-uuid',
        email: 'same.email@example.com',
        fullName: 'Current User',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(currentUser.id, currentUser);

      const { cookieValue, authUrl } = googleAuthService.createOAuthTransaction(
        'link',
        currentUser.id,
      );
      const state = new URL(authUrl).searchParams.get('state')!;

      jest.spyOn(googleAuthService, 'exchangeAndVerify').mockResolvedValueOnce({
        googleSubject: 'already-used-google-sub',
        email: 'same.email@example.com',
        fullName: 'Current User Google',
        emailVerified: true,
      });

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?code=valid-code&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/customer/dashboard?link_error=google_already_linked`,
      );
      expect(usersService.linkGoogleSubject).not.toHaveBeenCalled();
    });

    it('rejects linking when current user already has a different Google identity linked', async () => {
      const alreadyLinkedUser: MockUser = {
        id: 'already-linked-uuid',
        email: 'existing.google@example.com',
        fullName: 'Already Linked User',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: 'existing-sub-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(alreadyLinkedUser.id, alreadyLinkedUser);

      const { cookieValue, authUrl } = googleAuthService.createOAuthTransaction(
        'link',
        alreadyLinkedUser.id,
      );
      const state = new URL(authUrl).searchParams.get('state')!;

      jest.spyOn(googleAuthService, 'exchangeAndVerify').mockResolvedValueOnce({
        googleSubject: 'new-different-sub-456',
        email: 'existing.google@example.com',
        fullName: 'Already Linked User',
        emailVerified: true,
      });

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?code=valid-code&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/customer/dashboard?link_error=already_has_google`,
      );
      expect(usersService.linkGoogleSubject).not.toHaveBeenCalled();
    });

    it('redirects Customer to /customer/dashboard when Google consent is denied', async () => {
      const customer: MockUser = {
        id: 'cust-cancel-id',
        email: 'customer.cancel@example.com',
        fullName: 'Customer Cancel',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(customer.id, customer);

      const { cookieValue, authUrl } = googleAuthService.createOAuthTransaction(
        'link',
        customer.id,
      );
      const state = new URL(authUrl).searchParams.get('state')!;

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?error=access_denied&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/customer/dashboard?link_error=access_denied`,
      );
    });

    it('rejects account-linking error response when state is missing or mismatched', async () => {
      const customer: MockUser = {
        id: 'cust-mismatch-id',
        email: 'customer.mismatch@example.com',
        fullName: 'Customer Mismatch',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(customer.id, customer);

      const { cookieValue } = googleAuthService.createOAuthTransaction(
        'link',
        customer.id,
      );

      // 1. Missing state
      const missingStateResp = await request(getHttpApp())
        .get('/auth/google/callback?error=access_denied')
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(missingStateResp.headers.location).toBe(
        `${WEB_APP_URL}/customer/dashboard?link_error=oauth_invalid_state`,
      );

      // 2. Mismatched state
      const wrongStateResp = await request(getHttpApp())
        .get('/auth/google/callback?error=access_denied&state=tampered-state')
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(wrongStateResp.headers.location).toBe(
        `${WEB_APP_URL}/customer/dashboard?link_error=oauth_invalid_state`,
      );
    });

    it('redirects Merchant to /merchant/dashboard when account-linking error occurs', async () => {
      const merchant: MockUser = {
        id: 'merchant-link-id',
        email: 'merchant.link@example.com',
        fullName: 'Merchant Link',
        role: Role.MERCHANT,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(merchant.id, merchant);

      const { cookieValue, authUrl } = googleAuthService.createOAuthTransaction(
        'link',
        merchant.id,
      );
      const state = new URL(authUrl).searchParams.get('state')!;

      // 1. Consent cancelled (access_denied) with valid state
      const cancelResponse = await request(getHttpApp())
        .get(`/auth/google/callback?error=access_denied&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(cancelResponse.headers.location).toBe(
        `${WEB_APP_URL}/merchant/dashboard?link_error=access_denied`,
      );

      // 2. Email mismatch
      const { cookieValue: cookie2, authUrl: authUrl2 } =
        googleAuthService.createOAuthTransaction('link', merchant.id);
      const state2 = new URL(authUrl2).searchParams.get('state')!;

      jest.spyOn(googleAuthService, 'exchangeAndVerify').mockResolvedValueOnce({
        googleSubject: 'merchant-google-sub',
        email: 'other.email@example.com',
        fullName: 'Other Email',
        emailVerified: true,
      });

      const mismatchResponse = await request(getHttpApp())
        .get(`/auth/google/callback?code=valid-code&state=${state2}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookie2}`])
        .expect(HttpStatus.FOUND);

      expect(mismatchResponse.headers.location).toBe(
        `${WEB_APP_URL}/merchant/dashboard?link_error=email_mismatch`,
      );
    });

    it('redirects Courier to /courier/dashboard when account-linking error occurs', async () => {
      const courier: MockUser = {
        id: 'courier-link-id',
        email: 'courier.link@example.com',
        fullName: 'Courier Link',
        role: Role.COURIER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(courier.id, courier);

      const { cookieValue, authUrl } = googleAuthService.createOAuthTransaction(
        'link',
        courier.id,
      );
      const state = new URL(authUrl).searchParams.get('state')!;

      const response = await request(getHttpApp())
        .get(`/auth/google/callback?error=access_denied&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(response.headers.location).toBe(
        `${WEB_APP_URL}/courier/dashboard?link_error=access_denied`,
      );
    });

    it('redirects Admin/Dispatcher to /admin-landing when account-linking error occurs', async () => {
      const admin: MockUser = {
        id: 'admin-link-id',
        email: 'admin.link@example.com',
        fullName: 'Admin Link',
        role: Role.ADMIN,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(admin.id, admin);

      const { cookieValue, authUrl } = googleAuthService.createOAuthTransaction(
        'link',
        admin.id,
      );
      const state = new URL(authUrl).searchParams.get('state')!;

      const adminResponse = await request(getHttpApp())
        .get(`/auth/google/callback?error=access_denied&state=${state}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${cookieValue}`])
        .expect(HttpStatus.FOUND);

      expect(adminResponse.headers.location).toBe(
        `${WEB_APP_URL}/admin-landing?link_error=access_denied`,
      );

      const dispatcher: MockUser = {
        id: 'dispatcher-link-id',
        email: 'dispatcher.link@example.com',
        fullName: 'Dispatcher Link',
        role: Role.DISPATCHER,
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        googleSubject: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersDb.set(dispatcher.id, dispatcher);

      const { cookieValue: dispCookie, authUrl: dispAuthUrl } =
        googleAuthService.createOAuthTransaction('link', dispatcher.id);
      const dispState = new URL(dispAuthUrl).searchParams.get('state')!;

      const dispResponse = await request(getHttpApp())
        .get(`/auth/google/callback?error=access_denied&state=${dispState}`)
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${dispCookie}`])
        .expect(HttpStatus.FOUND);

      expect(dispResponse.headers.location).toBe(
        `${WEB_APP_URL}/admin-landing?link_error=access_denied`,
      );
    });

    it('falls back safely to /login when transaction is invalid or initiating user cannot be identified', async () => {
      // 1. Non-existent link user
      const {
        cookieValue: unidentifiableCookie,
        authUrl: unidentifiableAuthUrl,
      } = googleAuthService.createOAuthTransaction(
        'link',
        'non-existent-user-id',
      );
      const unidentifiableState = new URL(
        unidentifiableAuthUrl,
      ).searchParams.get('state')!;

      const response1 = await request(getHttpApp())
        .get(
          `/auth/google/callback?error=access_denied&state=${unidentifiableState}`,
        )
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=${unidentifiableCookie}`])
        .expect(HttpStatus.FOUND);

      expect(response1.headers.location).toBe(
        `${WEB_APP_URL}/login?error=access_denied`,
      );

      // 2. Invalid transaction cookie
      const response2 = await request(getHttpApp())
        .get('/auth/google/callback?error=access_denied&state=any-state')
        .set('Cookie', [`${OAUTH_TX_COOKIE_NAME}=tampered.cookie`])
        .expect(HttpStatus.FOUND);

      expect(response2.headers.location).toBe(
        `${WEB_APP_URL}/login?error=oauth_invalid_state`,
      );
    });
  });
});
