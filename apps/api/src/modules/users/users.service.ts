import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  UsersRepository,
  type CreateCustomerData,
  type CreateMerchantData,
  type CreateCourierData,
} from './repositories/users.repository.js';
import { PasswordService } from '../auth/password.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import {
  NotificationChannel,
  NotificationStatus,
} from '../../generated/prisma/enums.js';
import type {
  User,
  MerchantProfile,
  CourierProfile,
} from '../../generated/prisma/client.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    @Optional() private readonly passwordService?: PasswordService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    if (!email) {
      return null;
    }
    return this.usersRepository.findByEmail(email);
  }

  async findById(id: string): Promise<User | null> {
    if (!id) {
      return null;
    }
    return this.usersRepository.findById(id);
  }

  async findByGoogleSubject(googleSubject: string): Promise<User | null> {
    if (!googleSubject) {
      return null;
    }
    return this.usersRepository.findByGoogleSubject(googleSubject);
  }

  async createGoogleCustomer(data: {
    email: string;
    fullName: string;
    googleSubject: string;
  }): Promise<User> {
    return this.usersRepository.createGoogleCustomer(data);
  }

  async linkGoogleSubject(
    userId: string,
    googleSubject: string,
  ): Promise<User> {
    return this.usersRepository.linkGoogleSubject(userId, googleSubject);
  }

  async createCustomer(data: CreateCustomerData): Promise<User> {
    return this.usersRepository.createCustomer(data);
  }

  async createMerchant(
    data: CreateMerchantData,
  ): Promise<User & { merchantProfile: MerchantProfile }> {
    return this.usersRepository.createMerchant(data);
  }

  async createCourier(
    data: CreateCourierData,
  ): Promise<User & { courierProfile: CourierProfile }> {
    return this.usersRepository.createCourier(data);
  }

  async updatePassword(userId: string, passwordHash: string): Promise<User> {
    return this.usersRepository.updatePassword(userId, passwordHash);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.passwordHash) {
      throw new BadRequestException(
        'Password cannot be changed for accounts without password authentication',
      );
    }

    if (!this.passwordService) {
      throw new Error('PasswordService is not available');
    }

    // Verify current password hash before saving new hash
    const isCurrentPasswordValid = await this.passwordService.verify(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash the new password
    const newPasswordHash = await this.passwordService.hash(dto.newPassword);

    // Save the new hash
    await this.usersRepository.updatePassword(user.id, newPasswordHash);

    // Send security email to user
    if (this.emailService) {
      try {
        await this.emailService.sendPasswordChangedSettingsEmail(
          user.email,
          user.fullName,
          userAgent,
        );
      } catch (emailError) {
        this.logger.error(
          `Failed to send password changed email to ${user.email}: ${(emailError as Error).message}`,
          (emailError as Error).stack,
        );
      }
    }

    // Insert in-app notification in Notification table
    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: user.id,
            template: 'password_changed_settings',
            title: 'Password changed',
            description: 'Your password was successfully updated.',
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });

        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.EMAIL,
            recipientUserId: user.id,
            template: 'password_changed_settings',
            title: 'Password changed',
            description: 'Your password was successfully updated.',
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (notifError) {
        this.logger.error(
          `Failed to create notification records for user ${user.id}: ${(notifError as Error).message}`,
        );
      }
    }

    return { message: 'Your password was successfully updated' };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<{ message: string; user: Omit<User, 'passwordHash'> }> {
    const currentUser = await this.usersRepository.findById(userId);
    if (!currentUser) {
      throw new NotFoundException('User not found');
    }

    const emailChanged =
      Boolean(dto.email) &&
      dto.email!.trim().toLowerCase() !== currentUser.email.toLowerCase();
    const phoneChanged =
      Boolean(dto.phoneNumber) &&
      dto.phoneNumber!.trim() !== (currentUser.phoneNumber ?? '');
    const fullNameChanged =
      Boolean(dto.fullName) &&
      dto.fullName!.trim() !== currentUser.fullName;

    if (emailChanged) {
      const existing = await this.usersRepository.findByEmail(dto.email!);
      if (existing && existing.id !== userId) {
        throw new ConflictException(
          'Email address is already in use by another account',
        );
      }
    }

    const updatedUser = await this.usersRepository.updateProfile(userId, {
      fullName: dto.fullName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
    });

    if (emailChanged || phoneChanged || fullNameChanged) {
      const changes = {
        emailChanged,
        newEmail: dto.email ? dto.email.trim().toLowerCase() : undefined,
        phoneChanged,
        newPhone: dto.phoneNumber ? dto.phoneNumber.trim() : undefined,
        fullNameChanged,
        newFullName: dto.fullName ? dto.fullName.trim() : undefined,
      };

      if (this.emailService) {
        try {
          await this.emailService.sendProfileUpdatedEmail(
            currentUser.email,
            changes,
            updatedUser.fullName,
          );

          if (emailChanged && dto.email) {
            await this.emailService.sendProfileUpdatedEmail(
              dto.email.trim().toLowerCase(),
              changes,
              updatedUser.fullName,
            );
          }
        } catch (emailErr) {
          this.logger.error(
            `Failed to send profile update email for user ${userId}: ${(emailErr as Error).message}`,
          );
        }
      }

      if (this.prisma) {
        try {
          await this.prisma.notification.create({
            data: {
              eventId: randomUUID(),
              channel: NotificationChannel.IN_APP,
              recipientUserId: userId,
              template: 'profile_updated',
              title: 'Profile updated',
              description: 'Your contact details were successfully updated.',
              status: NotificationStatus.SENT,
              sentAt: new Date(),
            },
          });

          await this.prisma.notification.create({
            data: {
              eventId: randomUUID(),
              channel: NotificationChannel.EMAIL,
              recipientUserId: userId,
              template: 'profile_updated',
              title: 'Profile updated',
              description: 'Your contact details were successfully updated.',
              status: NotificationStatus.SENT,
              sentAt: new Date(),
            },
          });
        } catch (notifErr) {
          this.logger.error(
            `Failed to record notification for profile update of user ${userId}: ${(notifErr as Error).message}`,
          );
        }
      }
    }

    const { passwordHash: _, ...safeUser } = updatedUser;
    return {
      message: 'Profile updated successfully',
      user: safeUser,
    };
  }
}
