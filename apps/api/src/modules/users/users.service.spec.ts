import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service.js';
import { UsersRepository } from './repositories/users.repository.js';
import { PasswordService } from '../auth/password.service.js';
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

describe('UsersService', () => {
  let service: UsersService;
  let repository: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    createCustomer: jest.Mock;
    createMerchant: jest.Mock;
    createCourier: jest.Mock;
    updatePassword: jest.Mock;
  };
  let passwordService: {
    verify: jest.Mock;
    hash: jest.Mock;
  };
  let emailService: {
    sendPasswordChangedSettingsEmail: jest.Mock;
  };
  let prismaService: {
    notification: { create: jest.Mock };
  };

  const mockUser: User = {
    id: 'user-uuid-1',
    email: 'user@example.com',
    fullName: 'Jane Doe',
    phoneNumber: '+94771234567',
    passwordHash: '$2b$12$hashedPassword',
    role: Role.CUSTOMER,
    approvalStatus: ApprovalStatus.APPROVED,
    isActive: true,
    googleSubject: null,
    twoFactorEnabled: false,
    deliveryStatusNotifications: true,
    failedDeliveryNotifications: true,
    storeConnectionNotifications: true,
    language: 'English',
    timeZone: 'Asia/Colombo (UTC+05:30)',
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      createCustomer: jest.fn(),
      createMerchant: jest.fn(),
      createCourier: jest.fn(),
      updatePassword: jest.fn(),
    };
    passwordService = {
      verify: jest.fn(),
      hash: jest.fn(),
    };
    emailService = {
      sendPasswordChangedSettingsEmail: jest.fn().mockResolvedValue(undefined),
    };
    prismaService = {
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notif-uuid' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repository },
        { provide: PasswordService, useValue: passwordService },
        { provide: EmailService, useValue: emailService },
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findByEmail', () => {
    it('delegates to repository with provided email', async () => {
      repository.findByEmail.mockResolvedValue(mockUser);

      const result = await service.findByEmail('user@example.com');
      expect(repository.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(result).toEqual(mockUser);
    });

    it('returns null if email is empty or null', async () => {
      const result = await service.findByEmail('');
      expect(result).toBeNull();
      expect(repository.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('delegates to repository with provided ID', async () => {
      repository.findById.mockResolvedValue(mockUser);

      const result = await service.findById('user-uuid-1');
      expect(repository.findById).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual(mockUser);
    });

    it('returns null if ID is empty or null', async () => {
      const result = await service.findById('');
      expect(result).toBeNull();
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  describe('createCustomer', () => {
    it('delegates customer creation to repository', async () => {
      repository.createCustomer.mockResolvedValue(mockUser);

      const data = {
        email: 'user@example.com',
        fullName: 'Jane Doe',
        phoneNumber: '+94771234567',
        passwordHash: '$2b$12$hashedPassword',
      };

      const result = await service.createCustomer(data);
      expect(repository.createCustomer).toHaveBeenCalledWith(data);
      expect(result).toEqual(mockUser);
    });
  });

  describe('createMerchant', () => {
    it('delegates merchant creation to repository', async () => {
      const merchantWithProfile = {
        ...mockUser,
        role: Role.MERCHANT,
        approvalStatus: ApprovalStatus.PENDING,
        merchantProfile: {
          id: 'profile-1',
          userId: mockUser.id,
          businessName: 'My Store',
          businessAddress: '123 Main St',
          businessType: 'Retail',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      repository.createMerchant.mockResolvedValue(merchantWithProfile);

      const data = {
        email: 'merchant@example.com',
        fullName: 'Jane Doe',
        phoneNumber: '+94771234567',
        passwordHash: '$2b$12$hashedPassword',
        businessName: 'My Store',
        businessAddress: '123 Main St',
        businessType: 'Retail',
      };

      const result = await service.createMerchant(data);
      expect(repository.createMerchant).toHaveBeenCalledWith(data);
      expect(result).toEqual(merchantWithProfile);
    });
  });

  describe('createCourier', () => {
    it('delegates courier creation to repository', async () => {
      const courierWithProfile = {
        ...mockUser,
        role: Role.COURIER,
        approvalStatus: ApprovalStatus.PENDING,
        courierProfile: {
          id: 'profile-2',
          userId: mockUser.id,
          vehicleType: VehicleType.MOTORCYCLE,
          licensePlate: 'WP-ABC-1234',
          licenseNumber: 'B1234567',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      repository.createCourier.mockResolvedValue(courierWithProfile);

      const data = {
        email: 'courier@example.com',
        fullName: 'Jane Doe',
        phoneNumber: '+94771234567',
        passwordHash: '$2b$12$hashedPassword',
        vehicleType: VehicleType.MOTORCYCLE,
        licensePlate: 'WP-ABC-1234',
        licenseNumber: 'B1234567',
      };

      const result = await service.createCourier(data);
      expect(repository.createCourier).toHaveBeenCalledWith(data);
      expect(result).toEqual(courierWithProfile);
    });
  });

  describe('changePassword', () => {
    it('verifies current password, hashes new password, updates DB, sends security email and creates notifications', async () => {
      repository.findById.mockResolvedValue(mockUser);
      passwordService.verify.mockResolvedValue(true);
      passwordService.hash.mockResolvedValue('$2b$12$newHashedPassword');
      repository.updatePassword.mockResolvedValue({
        ...mockUser,
        passwordHash: '$2b$12$newHashedPassword',
      });

      const result = await service.changePassword(
        mockUser.id,
        {
          currentPassword: 'current-valid-pass',
          newPassword: 'NewValidPassword123!',
        },
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      );

      expect(repository.findById).toHaveBeenCalledWith(mockUser.id);
      expect(passwordService.verify).toHaveBeenCalledWith(
        'current-valid-pass',
        mockUser.passwordHash,
      );
      expect(passwordService.hash).toHaveBeenCalledWith('NewValidPassword123!');
      expect(repository.updatePassword).toHaveBeenCalledWith(
        mockUser.id,
        '$2b$12$newHashedPassword',
      );
      expect(
        emailService.sendPasswordChangedSettingsEmail,
      ).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.fullName,
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      );

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
      expect(inAppCall?.[0].data.recipientUserId).toBe(mockUser.id);
      expect(inAppCall?.[0].data.title).toBe('Password changed');
      expect(inAppCall?.[0].data.description).toBe(
        'Your password was successfully updated.',
      );

      expect(result).toEqual({
        message: 'Your password was successfully updated',
      });
    });

    it('throws BadRequestException when current password is wrong', async () => {
      repository.findById.mockResolvedValue(mockUser);
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.changePassword(mockUser.id, {
          currentPassword: 'wrong-password',
          newPassword: 'NewValidPassword123!',
        }),
      ).rejects.toThrow(
        new BadRequestException('Current password is incorrect'),
      );

      expect(passwordService.hash).not.toHaveBeenCalled();
      expect(repository.updatePassword).not.toHaveBeenCalled();
      expect(
        emailService.sendPasswordChangedSettingsEmail,
      ).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when account has no passwordHash', async () => {
      repository.findById.mockResolvedValue({
        ...mockUser,
        passwordHash: null,
      });

      await expect(
        service.changePassword(mockUser.id, {
          currentPassword: 'any-password',
          newPassword: 'NewValidPassword123!',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Password cannot be changed for accounts without password authentication',
        ),
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.changePassword('non-existent-user', {
          currentPassword: 'any-password',
          newPassword: 'NewValidPassword123!',
        }),
      ).rejects.toThrow(new NotFoundException('User not found'));
    });
  });
});
