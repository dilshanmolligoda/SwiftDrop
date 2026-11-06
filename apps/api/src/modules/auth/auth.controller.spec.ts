import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import {
  Role,
  ApprovalStatus,
  VehicleType,
} from '../../generated/prisma/enums.js';
import type { LoginResult, UserProfile } from './auth.service.js';
import {
  AUTH_COOKIE_NAME,
  isSecureCookie,
  getAuthCookieOptions,
  getClearAuthCookieOptions,
} from './utils/cookie.util.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    registerCustomer: jest.Mock;
    registerMerchant: jest.Mock;
    registerCourier: jest.Mock;
    getProfile: jest.Mock;
    getApplicationStatus: jest.Mock;
  };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      registerCustomer: jest.fn(),
      registerMerchant: jest.fn(),
      registerCourier: jest.fn(),
      getProfile: jest.fn(),
      getApplicationStatus: jest.fn(),
    };
    configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'NODE_ENV') return 'development';
          if (key === 'AUTH_COOKIE_PATH') return '/api';
          return defaultValue;
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: configService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('delegates login to AuthService.login, sets HTTP-only cookie, and omits accessToken from body', async () => {
    const loginResult: LoginResult = {
      accessToken: 'sample-secret-jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        fullName: 'Test User',
        role: Role.CUSTOMER,
      },
    };
    authService.login.mockResolvedValue(loginResult);

    const mockCookieFn = jest.fn();
    const mockRes = {
      cookie: mockCookieFn,
    } as unknown as Response;

    const dto = { email: 'user@example.com', password: 'password123' };
    const result = await controller.login(dto, mockRes);

    expect(authService.login).toHaveBeenCalledWith(dto);
    expect(mockCookieFn).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      'sample-secret-jwt',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api',
        secure: false, // in development
      }),
    );

    // Verify response body does not expose the access token
    expect(result).toEqual({
      expiresIn: 900,
      user: loginResult.user,
    });
    expect((result as Record<string, unknown>).accessToken).toBeUndefined();
  });

  it('delegates getProfile to AuthService.getProfile using authenticated user id', async () => {
    const profileResponse: UserProfile = {
      id: 'user-1',
      email: 'user@example.com',
      fullName: 'Test User',
      role: Role.CUSTOMER,
      approvalStatus: ApprovalStatus.APPROVED,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    authService.getProfile.mockResolvedValue(profileResponse);

    const currentUser = {
      id: 'user-1',
      email: 'user@example.com',
      role: Role.CUSTOMER,
    };
    const result = await controller.getProfile(currentUser);

    expect(authService.getProfile).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(profileResponse);
  });

  it('clears authentication cookie on logout with matching cookie attributes', () => {
    const mockClearCookieFn = jest.fn();
    const mockRes = {
      clearCookie: mockClearCookieFn,
    } as unknown as Response;

    const result = controller.logout(mockRes);

    expect(mockClearCookieFn).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api',
        secure: false,
      }),
    );
    expect(result).toEqual({ message: 'Logged out successfully' });
  });

  describe('registration endpoints', () => {
    it('registerCustomer sets HTTP-only cookie and returns user summary', async () => {
      const regResult: LoginResult = {
        accessToken: 'customer-jwt-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: 'cust-1',
          email: 'cust@example.com',
          fullName: 'Customer One',
          role: Role.CUSTOMER,
          approvalStatus: ApprovalStatus.APPROVED,
        },
      };
      authService.registerCustomer.mockResolvedValue(regResult);

      const mockCookieFn = jest.fn();
      const mockRes = { cookie: mockCookieFn } as unknown as Response;

      const dto = {
        fullName: 'Customer One',
        email: 'cust@example.com',
        phoneNumber: '0771234567',
        password: 'Password123456!',
      };

      const result = await controller.registerCustomer(dto, mockRes);

      expect(authService.registerCustomer).toHaveBeenCalledWith(dto);
      expect(mockCookieFn).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        'customer-jwt-token',
        expect.objectContaining({ httpOnly: true, path: '/api' }),
      );
      expect(result).toEqual({
        expiresIn: 900,
        user: regResult.user,
      });
    });

    it('registerMerchant sets HTTP-only cookie and returns pending user summary', async () => {
      const regResult: LoginResult = {
        accessToken: 'merchant-jwt-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: 'merch-1',
          email: 'merch@example.com',
          fullName: 'Merchant One',
          role: Role.MERCHANT,
          approvalStatus: ApprovalStatus.PENDING,
        },
      };
      authService.registerMerchant.mockResolvedValue(regResult);

      const mockCookieFn = jest.fn();
      const mockRes = { cookie: mockCookieFn } as unknown as Response;

      const dto = {
        fullName: 'Merchant One',
        email: 'merch@example.com',
        phoneNumber: '0711234567',
        password: 'Password123456!',
        businessName: 'Biz Name',
        businessAddress: '123 Biz Rd',
        businessType: 'Retail',
      };

      const result = await controller.registerMerchant(dto, mockRes);

      expect(authService.registerMerchant).toHaveBeenCalledWith(dto);
      expect(mockCookieFn).toHaveBeenCalled();
      expect(result.user.approvalStatus).toBe(ApprovalStatus.PENDING);
    });

    it('registerCourier sets HTTP-only cookie and returns pending user summary', async () => {
      const regResult: LoginResult = {
        accessToken: 'courier-jwt-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: 'cour-1',
          email: 'cour@example.com',
          fullName: 'Courier One',
          role: Role.COURIER,
          approvalStatus: ApprovalStatus.PENDING,
        },
      };
      authService.registerCourier.mockResolvedValue(regResult);

      const mockCookieFn = jest.fn();
      const mockRes = { cookie: mockCookieFn } as unknown as Response;

      const dto = {
        fullName: 'Courier One',
        email: 'cour@example.com',
        phoneNumber: '0711234567',
        password: 'Password123456!',
        vehicleType: VehicleType.MOTORCYCLE,
        licensePlate: 'WP-1234',
        licenseNumber: 'B1234',
      };

      const result = await controller.registerCourier(dto, mockRes);

      expect(authService.registerCourier).toHaveBeenCalledWith(dto);
      expect(mockCookieFn).toHaveBeenCalled();
      expect(result.user.approvalStatus).toBe(ApprovalStatus.PENDING);
    });
  });

  describe('application-status endpoint', () => {
    it('returns application status for authenticated user', async () => {
      const statusData = {
        approvalStatus: ApprovalStatus.PENDING,
        status: ApprovalStatus.PENDING,
        role: Role.MERCHANT,
        submittedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        reviewedAt: null,
        rejectionReason: null,
      };
      authService.getApplicationStatus.mockResolvedValue(statusData);

      const result = await controller.getApplicationStatus({
        id: 'user-1',
        email: 'user@example.com',
        role: Role.MERCHANT,
      });

      expect(authService.getApplicationStatus).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(statusData);
    });
  });

  describe('isSecureCookie fail-safe configuration', () => {
    it('sets secure: false in development environment', () => {
      const mockConfig = {
        get: jest.fn().mockReturnValue('development'),
      } as unknown as ConfigService;
      expect(isSecureCookie(mockConfig)).toBe(false);
      expect(getAuthCookieOptions(mockConfig, 900).secure).toBe(false);
      expect(getClearAuthCookieOptions(mockConfig).secure).toBe(false);
    });

    it('sets secure: false in test environment', () => {
      const mockConfig = {
        get: jest.fn().mockReturnValue('test'),
      } as unknown as ConfigService;
      expect(isSecureCookie(mockConfig)).toBe(false);
      expect(getAuthCookieOptions(mockConfig, 900).secure).toBe(false);
      expect(getClearAuthCookieOptions(mockConfig).secure).toBe(false);
    });

    it('sets secure: true in production environment', () => {
      const mockConfig = {
        get: jest.fn().mockReturnValue('production'),
      } as unknown as ConfigService;
      expect(isSecureCookie(mockConfig)).toBe(true);
      expect(getAuthCookieOptions(mockConfig, 900).secure).toBe(true);
      expect(getClearAuthCookieOptions(mockConfig).secure).toBe(true);
    });

    it('fails safe to secure: true when NODE_ENV is undefined or unexpected', () => {
      const mockConfigUndefined = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;
      expect(isSecureCookie(mockConfigUndefined)).toBe(true);
      expect(getAuthCookieOptions(mockConfigUndefined, 900).secure).toBe(true);
      expect(getClearAuthCookieOptions(mockConfigUndefined).secure).toBe(true);

      const mockConfigStaging = {
        get: jest.fn().mockReturnValue('staging'),
      } as unknown as ConfigService;
      expect(isSecureCookie(mockConfigStaging)).toBe(true);
    });
  });
});
