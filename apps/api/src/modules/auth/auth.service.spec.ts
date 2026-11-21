import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService, parseTtlToSeconds } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { UsersService } from '../users/users.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  Role,
  ApprovalStatus,
  VehicleType,
  NotificationChannel,
  NotificationStatus,
} from '../../generated/prisma/enums.js';
import type { User } from '../../generated/prisma/client.js';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    createCustomer: jest.Mock;
    createMerchant: jest.Mock;
    createCourier: jest.Mock;
  };
  let passwordService: { verify: jest.Mock; hash: jest.Mock };
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let configService: { getOrThrow: jest.Mock; get: jest.Mock };
  let emailService: {
    sendCustomerWelcomeEmail: jest.Mock;
    sendWelcomeEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
    sendPasswordResetConfirmationEmail: jest.Mock;
  };
  let prismaService: {
    user: { update: jest.Mock };
    notification: { create: jest.Mock };
  };

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
      createCustomer: jest.fn(),
      createMerchant: jest.fn(),
      createCourier: jest.fn(),
    };
    passwordService = {
      verify: jest.fn(),
      hash: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };
    emailService = {
      sendCustomerWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetConfirmationEmail: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    prismaService = {
      user: {
        update: jest.fn().mockResolvedValue(validUser),
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notif-uuid' }),
      },
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
        { provide: EmailService, useValue: emailService },
        { provide: PrismaService, useValue: prismaService },
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
          approvalStatus: validUser.approvalStatus,
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
          approvalStatus: validUser.approvalStatus,
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

    it('throws generic UnauthorizedException when account is inactive (prevents enumeration)', async () => {
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
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

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

  describe('registerCustomer', () => {
    it('creates customer with normalized email/phone, hashes password, and returns auth session', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      passwordService.hash.mockResolvedValue('$2b$12$hashedRegisteredPassword');
      jwtService.signAsync.mockResolvedValue('signed-customer-token');

      const createdUser: User = {
        ...validUser,
        id: 'new-customer-uuid',
        email: 'newcustomer@example.com',
        fullName: 'New Customer',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
      };
      usersService.createCustomer.mockResolvedValue(createdUser);

      const result = await authService.registerCustomer({
        fullName: 'New Customer',
        email: '  NewCustomer@Example.COM ',
        phoneNumber: '077 123 4567',
        password: 'securePassword123!',
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'newcustomer@example.com',
      );
      expect(passwordService.hash).toHaveBeenCalledWith('securePassword123!');
      expect(usersService.createCustomer).toHaveBeenCalledWith({
        email: 'newcustomer@example.com',
        fullName: 'New Customer',
        phoneNumber: '+94771234567',
        passwordHash: '$2b$12$hashedRegisteredPassword',
      });
      expect(result.user.approvalStatus).toBe(ApprovalStatus.APPROVED);
      expect(result.user.role).toBe(Role.CUSTOMER);
      expect(result.accessToken).toBe('signed-customer-token');
      expect(emailService.sendCustomerWelcomeEmail).toHaveBeenCalledWith(
        'newcustomer@example.com',
        'New Customer',
      );
      expect(prismaService.notification.create).toHaveBeenCalledTimes(2);
      const emailCall = prismaService.notification.create.mock.calls[0] as [
        {
          data: {
            channel: string;
            recipientUserId: string;
            template: string;
            title: string;
            description: string;
            status: string;
          };
        },
      ];
      expect(emailCall[0].data.channel).toBe(NotificationChannel.EMAIL);
      expect(emailCall[0].data.recipientUserId).toBe('new-customer-uuid');
      expect(emailCall[0].data.template).toBe('customer_welcome');
      expect(emailCall[0].data.title).toBe('Welcome to SwiftDrop!');
      expect(emailCall[0].data.description).toBe(
        'Your customer account is active. Start by booking your first delivery.',
      );
      expect(emailCall[0].data.status).toBe(NotificationStatus.SENT);

      const inAppCall = prismaService.notification.create.mock.calls[1] as [
        {
          data: {
            channel: string;
            recipientUserId: string;
            template: string;
            title: string;
            description: string;
            status: string;
          };
        },
      ];
      expect(inAppCall[0].data.channel).toBe(NotificationChannel.IN_APP);
      expect(inAppCall[0].data.recipientUserId).toBe('new-customer-uuid');
      expect(inAppCall[0].data.template).toBe('customer_welcome');
      expect(inAppCall[0].data.title).toBe('Welcome to SwiftDrop!');
      expect(inAppCall[0].data.description).toBe(
        'Your customer account is active. Start by booking your first delivery.',
      );
      expect(inAppCall[0].data.status).toBe(NotificationStatus.SENT);
    });

    it('triggers a welcome email via EmailService and inserts in-app notification upon registration', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      passwordService.hash.mockResolvedValue('$2b$12$hashedRegisteredPassword');
      jwtService.signAsync.mockResolvedValue('signed-customer-token');

      const createdUser: User = {
        ...validUser,
        id: 'customer-welcome-uuid',
        email: 'welcome.test@example.com',
        fullName: 'Jane Doe',
        role: Role.CUSTOMER,
        approvalStatus: ApprovalStatus.APPROVED,
      };
      usersService.createCustomer.mockResolvedValue(createdUser);

      await authService.registerCustomer({
        fullName: 'Jane Doe',
        email: 'welcome.test@example.com',
        phoneNumber: '0779998888',
        password: 'securePassword123!',
      });

      expect(emailService.sendCustomerWelcomeEmail).toHaveBeenCalledWith(
        'welcome.test@example.com',
        'Jane Doe',
      );
      expect(prismaService.notification.create).toHaveBeenCalledTimes(2);
      const emailNotifCall = prismaService.notification.create.mock
        .calls[0] as [
        {
          data: {
            channel: string;
            recipientUserId: string;
            template: string;
            title: string;
            description: string;
            status: string;
          };
        },
      ];
      expect(emailNotifCall[0].data.channel).toBe(NotificationChannel.EMAIL);
      expect(emailNotifCall[0].data.recipientUserId).toBe(
        'customer-welcome-uuid',
      );
      expect(emailNotifCall[0].data.template).toBe('customer_welcome');
      expect(emailNotifCall[0].data.title).toBe('Welcome to SwiftDrop!');
      expect(emailNotifCall[0].data.description).toBe(
        'Your customer account is active. Start by booking your first delivery.',
      );
      expect(emailNotifCall[0].data.status).toBe(NotificationStatus.SENT);

      const inAppNotifCall = prismaService.notification.create.mock
        .calls[1] as [
        {
          data: {
            channel: string;
            recipientUserId: string;
            template: string;
            title: string;
            description: string;
            status: string;
          };
        },
      ];
      expect(inAppNotifCall[0].data.channel).toBe(NotificationChannel.IN_APP);
      expect(inAppNotifCall[0].data.recipientUserId).toBe(
        'customer-welcome-uuid',
      );
      expect(inAppNotifCall[0].data.template).toBe('customer_welcome');
      expect(inAppNotifCall[0].data.title).toBe('Welcome to SwiftDrop!');
      expect(inAppNotifCall[0].data.description).toBe(
        'Your customer account is active. Start by booking your first delivery.',
      );
      expect(inAppNotifCall[0].data.status).toBe(NotificationStatus.SENT);
    });

    it('throws ConflictException when email is already registered', async () => {
      usersService.findByEmail.mockResolvedValue(validUser);

      await expect(
        authService.registerCustomer({
          fullName: 'Test User',
          email: 'user@example.com',
          phoneNumber: '0771234567',
          password: 'securePassword123!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('registerMerchant', () => {
    it('creates merchant and profile in transaction with PENDING status', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      passwordService.hash.mockResolvedValue('$2b$12$hashedMerchantPassword');
      jwtService.signAsync.mockResolvedValue('signed-merchant-token');

      const createdMerchant = {
        ...validUser,
        id: 'merchant-uuid',
        email: 'store@example.com',
        role: Role.MERCHANT,
        approvalStatus: ApprovalStatus.PENDING,
        merchantProfile: {
          id: 'mp-1',
          userId: 'merchant-uuid',
          businessName: 'My Store',
          businessAddress: 'Colombo 03',
          businessType: 'Retail',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      usersService.createMerchant.mockResolvedValue(createdMerchant);

      const result = await authService.registerMerchant({
        fullName: 'Merchant Owner',
        email: 'store@example.com',
        phoneNumber: '0712345678',
        password: 'merchantPassword123!',
        businessName: 'My Store',
        businessAddress: 'Colombo 03',
        businessType: 'Retail',
      });

      expect(usersService.createMerchant).toHaveBeenCalledWith({
        email: 'store@example.com',
        fullName: 'Merchant Owner',
        phoneNumber: '+94712345678',
        passwordHash: '$2b$12$hashedMerchantPassword',
        businessName: 'My Store',
        businessAddress: 'Colombo 03',
        businessType: 'Retail',
      });
      expect(result.user.approvalStatus).toBe(ApprovalStatus.PENDING);
      expect(result.user.role).toBe(Role.MERCHANT);
    });
  });

  describe('registerCourier', () => {
    it('creates motorized courier with vehicle registration and driving licence', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      passwordService.hash.mockResolvedValue('$2b$12$hashedCourierPassword');
      jwtService.signAsync.mockResolvedValue('signed-courier-token');

      const createdCourier = {
        ...validUser,
        id: 'courier-uuid',
        email: 'rider@example.com',
        role: Role.COURIER,
        approvalStatus: ApprovalStatus.PENDING,
        courierProfile: {
          id: 'cp-1',
          userId: 'courier-uuid',
          vehicleType: VehicleType.MOTORCYCLE,
          licensePlate: 'WP-BCC-1234',
          licenseNumber: 'DL12345678',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      usersService.createCourier.mockResolvedValue(createdCourier);

      const result = await authService.registerCourier({
        fullName: 'Bike Rider',
        email: 'rider@example.com',
        phoneNumber: '0781234567',
        password: 'courierPassword123!',
        vehicleType: VehicleType.MOTORCYCLE,
        licensePlate: 'WP-BCC-1234',
        licenseNumber: 'DL12345678',
      });

      expect(usersService.createCourier).toHaveBeenCalledWith({
        email: 'rider@example.com',
        fullName: 'Bike Rider',
        phoneNumber: '+94781234567',
        passwordHash: '$2b$12$hashedCourierPassword',
        vehicleType: VehicleType.MOTORCYCLE,
        licensePlate: 'WP-BCC-1234',
        licenseNumber: 'DL12345678',
      });
      expect(result.user.approvalStatus).toBe(ApprovalStatus.PENDING);
      expect(result.user.role).toBe(Role.COURIER);
    });

    it('creates bicycle courier without requiring plate or driving licence', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      passwordService.hash.mockResolvedValue('$2b$12$hashedCourierPassword');
      jwtService.signAsync.mockResolvedValue('signed-bicycle-token');

      const createdBicycleCourier = {
        ...validUser,
        id: 'courier-bike-uuid',
        email: 'cyclist@example.com',
        role: Role.COURIER,
        approvalStatus: ApprovalStatus.PENDING,
      };
      usersService.createCourier.mockResolvedValue(createdBicycleCourier);

      const result = await authService.registerCourier({
        fullName: 'Eco Cyclist',
        email: 'cyclist@example.com',
        phoneNumber: '0781234567',
        password: 'cyclistPassword123!',
        vehicleType: VehicleType.BICYCLE,
      });

      expect(usersService.createCourier).toHaveBeenCalledWith({
        email: 'cyclist@example.com',
        fullName: 'Eco Cyclist',
        phoneNumber: '+94781234567',
        passwordHash: '$2b$12$hashedCourierPassword',
        vehicleType: VehicleType.BICYCLE,
        licensePlate: null,
        licenseNumber: null,
      });
      expect(result.user.approvalStatus).toBe(ApprovalStatus.PENDING);
    });

    it('rejects motorized courier if licensePlate or licenseNumber is missing', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.registerCourier({
          fullName: 'Van Driver',
          email: 'driver@example.com',
          phoneNumber: '0781234567',
          password: 'driverPassword123!',
          vehicleType: VehicleType.VAN,
          licensePlate: '',
          licenseNumber: 'DL123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getApplicationStatus', () => {
    it('returns application status with timestamps and rejectionReason without exposing internal IDs', async () => {
      usersService.findById.mockResolvedValue({
        ...validUser,
        role: Role.MERCHANT,
        approvalStatus: ApprovalStatus.REJECTED,
        reviewedAt: new Date('2026-02-01T10:00:00Z'),
        reviewedBy: 'reviewer-admin-uuid',
        rejectionReason: 'Invalid business address documentation',
      });

      const status = await authService.getApplicationStatus(validUser.id);

      expect(status).toEqual({
        approvalStatus: ApprovalStatus.REJECTED,
        status: ApprovalStatus.REJECTED,
        role: Role.MERCHANT,
        submittedAt: validUser.createdAt,
        createdAt: validUser.createdAt,
        reviewedAt: new Date('2026-02-01T10:00:00Z'),
        rejectionReason: 'Invalid business address documentation',
      });
      expect('reviewedBy' in status).toBe(false);
    });
  });

  describe('forgotPassword', () => {
    it('generates a 15-minute signed token and dispatches reset email when user exists', async () => {
      usersService.findByEmail.mockResolvedValue(validUser);
      jwtService.signAsync.mockResolvedValue('secure-signed-reset-token');

      const result = await authService.forgotPassword({
        email: 'user@example.com',
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        {
          sub: validUser.id,
          userId: validUser.id,
          purpose: 'password_reset',
        },
        expect.objectContaining({
          expiresIn: '15m',
          algorithm: 'HS256',
        }),
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        validUser.email,
        'secure-signed-reset-token',
        validUser.fullName,
      );
      expect(result).toEqual({
        message: 'If the email exists, a reset link was sent',
      });
    });

    it('returns standard 200 message without generating token or sending email when user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await authService.forgotPassword({
        email: 'unknown@example.com',
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'unknown@example.com',
      );
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(result).toEqual({
        message: 'If the email exists, a reset link was sent',
      });
    });

    it('returns standard message gracefully even if email service fails', async () => {
      usersService.findByEmail.mockResolvedValue(validUser);
      jwtService.signAsync.mockResolvedValue('secure-signed-reset-token');
      emailService.sendPasswordResetEmail.mockRejectedValue(
        new Error('SMTP connection error'),
      );

      const result = await authService.forgotPassword({
        email: 'user@example.com',
      });

      expect(result).toEqual({
        message: 'If the email exists, a reset link was sent',
      });
    });
  });

  describe('resetPassword', () => {
    const validResetDto = {
      token: 'valid-jwt-token',
      newPassword: 'NewPassword123!',
    };

    it('successfully resets password, hashes new password, updates Prisma, dispatches security email and in-app notification', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: validUser.id,
        userId: validUser.id,
        purpose: 'password_reset',
      });
      usersService.findById.mockResolvedValue(validUser);
      passwordService.hash.mockResolvedValue('$2b$12$newHashedPassword');

      const result = await authService.resetPassword(validResetDto);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith(
        'valid-jwt-token',
        expect.objectContaining({
          algorithms: ['HS256'],
        }),
      );
      expect(usersService.findById).toHaveBeenCalledWith(validUser.id);
      expect(passwordService.hash).toHaveBeenCalledWith('NewPassword123!');
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: validUser.id },
        data: { passwordHash: '$2b$12$newHashedPassword' },
      });
      expect(
        emailService.sendPasswordResetConfirmationEmail,
      ).toHaveBeenCalledWith(validUser.email, validUser.fullName);

      const notifCalls = prismaService.notification.create.mock.calls as Array<
        [
          {
            data: {
              channel: NotificationChannel;
              recipientUserId: string;
              title: string;
              description: string;
              status: NotificationStatus;
            };
          },
        ]
      >;
      const inAppCall = notifCalls.find(
        ([arg]) => arg.data.channel === NotificationChannel.IN_APP,
      );
      expect(inAppCall).toBeDefined();
      expect(inAppCall?.[0].data.recipientUserId).toBe(validUser.id);
      expect(inAppCall?.[0].data.title).toBe('Password updated');
      expect(inAppCall?.[0].data.description).toBe(
        'Your account password was successfully reset.',
      );
      expect(inAppCall?.[0].data.status).toBe(NotificationStatus.SENT);

      expect(result).toEqual({
        message: 'Password has been reset successfully',
      });
    });

    it('rejects consumed reset tokens with BadRequestException', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: validUser.id,
        userId: validUser.id,
        purpose: 'password_reset',
      });
      usersService.findById.mockResolvedValue(validUser);
      passwordService.hash.mockResolvedValue('$2b$12$newHashedPassword');

      const tokenToConsume = 'unique-consumed-token';
      await authService.resetPassword({
        token: tokenToConsume,
        newPassword: 'NewPassword123!',
      });

      await expect(
        authService.resetPassword({
          token: tokenToConsume,
          newPassword: 'AnotherPassword123!',
        }),
      ).rejects.toThrow(
        new BadRequestException('Password reset token has already been used'),
      );
    });

    it('rejects expired or invalid signature tokens with BadRequestException', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(
        authService.resetPassword({
          token: 'expired-token',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(
        new BadRequestException('Invalid or expired password reset token'),
      );
    });

    it('rejects token with invalid purpose with BadRequestException', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: validUser.id,
        userId: validUser.id,
        purpose: 'access',
      });

      await expect(
        authService.resetPassword({
          token: 'wrong-purpose-token',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(
        new BadRequestException('Invalid password reset token purpose'),
      );
    });

    it('throws BadRequestException if user cannot be found', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'missing-user',
        userId: 'missing-user',
        purpose: 'password_reset',
      });
      usersService.findById.mockResolvedValue(null);

      await expect(
        authService.resetPassword({
          token: 'token-for-missing-user',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(new BadRequestException('User not found'));
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
