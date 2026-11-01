import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService, parseTtlToSeconds } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { UsersService } from '../users/users.service.js';
import { Role, ApprovalStatus } from '../../generated/prisma/enums.js';
import type { User } from '../../generated/prisma/client.js';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: { findByEmail: jest.Mock; findById: jest.Mock };
  let passwordService: { verify: jest.Mock; hash: jest.Mock };
  let jwtService: { signAsync: jest.Mock };
  let configService: { getOrThrow: jest.Mock; get: jest.Mock };

  const validUser: User = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'user@example.com',
    fullName: 'Test User',
    passwordHash: '$2b$12$fakeHashedPassword',
    role: Role.CUSTOMER,
    approvalStatus: ApprovalStatus.APPROVED,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };
    passwordService = {
      verify: jest.fn(),
      hash: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn(),
    };
    configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        return undefined;
      }),
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'JWT_ACCESS_TTL') return '15m';
          return defaultValue;
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: PasswordService, useValue: passwordService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('successfully logs in with valid credentials and returns accessToken', async () => {
      usersService.findByEmail.mockResolvedValue(validUser);
      passwordService.verify.mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValue('signed-jwt-token');

      const response = await authService.login({
        email: '  USER@example.COM ',
        password: 'correct-password',
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(passwordService.verify).toHaveBeenCalledWith(
        'correct-password',
        validUser.passwordHash,
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        {
          sub: validUser.id,
          email: validUser.email,
          role: validUser.role,
        },
        {
          secret: 'test-access-secret',
          expiresIn: 900,
          algorithm: 'HS256',
        },
      );
      expect(response).toEqual({
        accessToken: 'signed-jwt-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: validUser.id,
          email: validUser.email,
          fullName: validUser.fullName,
          role: validUser.role,
        },
      });
    });

    it('throws generic UnauthorizedException when email is not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'unknown@example.com',
          password: 'some-password',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(passwordService.verify).not.toHaveBeenCalled();
    });

    it('throws generic UnauthorizedException when password is incorrect', async () => {
      usersService.findByEmail.mockResolvedValue(validUser);
      passwordService.verify.mockResolvedValue(false);

      await expect(
        authService.login({
          email: 'user@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });

    it('throws generic UnauthorizedException when user has null passwordHash', async () => {
      const userWithoutPassword: User = {
        ...validUser,
        passwordHash: null,
      };
      usersService.findByEmail.mockResolvedValue(userWithoutPassword);

      await expect(
        authService.login({
          email: 'user@example.com',
          password: 'any-password',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(passwordService.verify).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when account is inactive', async () => {
      const inactiveUser: User = {
        ...validUser,
        isActive: false,
      };
      usersService.findByEmail.mockResolvedValue(inactiveUser);
      passwordService.verify.mockResolvedValue(true);

      await expect(
        authService.login({
          email: 'user@example.com',
          password: 'correct-password',
        }),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Account is inactive. Please contact support.',
        ),
      );

      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('correctly includes the user role in the issued token payload (e.g., ADMIN)', async () => {
      const adminUser: User = {
        ...validUser,
        id: '22222222-2222-2222-2222-222222222222',
        role: Role.ADMIN,
      };
      usersService.findByEmail.mockResolvedValue(adminUser);
      passwordService.verify.mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValue('admin-token');

      const response = await authService.login({
        email: 'admin@example.com',
        password: 'admin-password',
      });

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: adminUser.id,
          role: Role.ADMIN,
        }),
        expect.any(Object),
      );
      expect(response.user.role).toBe(Role.ADMIN);
    });
  });

  describe('getProfile', () => {
    it('returns user profile without exposing passwordHash', async () => {
      usersService.findById.mockResolvedValue(validUser);

      const profile = await authService.getProfile(validUser.id);

      expect(profile).toEqual({
        id: validUser.id,
        email: validUser.email,
        fullName: validUser.fullName,
        role: validUser.role,
        approvalStatus: validUser.approvalStatus,
        isActive: validUser.isActive,
        createdAt: validUser.createdAt,
        updatedAt: validUser.updatedAt,
      });
      expect('passwordHash' in profile).toBe(false);
    });

    it('throws UnauthorizedException when user is not found', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(authService.getProfile('non-existent-id')).rejects.toThrow(
        new UnauthorizedException('User not found or account is inactive'),
      );
    });

    it('throws UnauthorizedException when user is inactive', async () => {
      usersService.findById.mockResolvedValue({
        ...validUser,
        isActive: false,
      });

      await expect(authService.getProfile(validUser.id)).rejects.toThrow(
        new UnauthorizedException('User not found or account is inactive'),
      );
    });
  });

  describe('parseTtlToSeconds', () => {
    it('converts seconds, minutes, hours, and days accurately', () => {
      expect(parseTtlToSeconds('30s')).toBe(30);
      expect(parseTtlToSeconds('15m')).toBe(900);
      expect(parseTtlToSeconds('1h')).toBe(3600);
      expect(parseTtlToSeconds('7d')).toBe(604800);
      expect(parseTtlToSeconds(120)).toBe(120);
      expect(parseTtlToSeconds('invalid')).toBe(900);
    });
  });
});
