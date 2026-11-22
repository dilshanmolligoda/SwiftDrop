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
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto.js';
import {
  NotificationChannel,
  NotificationStatus,
  Role,
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
      Boolean(dto.fullName) && dto.fullName!.trim() !== currentUser.fullName;

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

    const safeUser: Omit<User, 'passwordHash'> = { ...updatedUser };
    delete (safeUser as { passwordHash?: string | null }).passwordHash;
    return {
      message: 'Profile updated successfully',
      user: safeUser,
    };
  }

  async approveCourier(courierId: string, reviewedBy?: string): Promise<User> {
    const user = await this.usersRepository.findById(courierId);
    if (!user) {
      throw new NotFoundException('Courier not found');
    }
    if (user.role !== Role.COURIER) {
      throw new BadRequestException('User is not a courier');
    }

    const updatedUser = await this.usersRepository.approveUser(
      courierId,
      reviewedBy,
    );

    if (this.emailService) {
      try {
        await this.emailService.sendCourierApprovedEmail(
          updatedUser.email,
          updatedUser.fullName,
        );
      } catch (emailErr) {
        this.logger.error(
          `Failed to send courier approval email to ${updatedUser.email}: ${(emailErr as Error).message}`,
        );
      }
    }

    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: updatedUser.id,
            template: 'courier_approved',
            title: 'Your courier account has been approved!',
            description: 'Log in to view your daily delivery assignments.',
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });

        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.EMAIL,
            recipientUserId: updatedUser.id,
            template: 'courier_approved',
            title: 'Your courier account has been approved!',
            description: 'Log in to view your daily delivery assignments.',
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (notifErr) {
        this.logger.error(
          `Failed to record courier approval notification for ${updatedUser.id}: ${(notifErr as Error).message}`,
        );
      }
    }

    return updatedUser;
  }

  async rejectCourier(
    courierId: string,
    reason: string,
    reviewedBy?: string,
  ): Promise<User> {
    const user = await this.usersRepository.findById(courierId);
    if (!user) {
      throw new NotFoundException('Courier not found');
    }
    if (user.role !== Role.COURIER) {
      throw new BadRequestException('User is not a courier');
    }

    const updatedUser = await this.usersRepository.rejectUser(
      courierId,
      reason,
      reviewedBy,
    );

    if (this.emailService) {
      try {
        await this.emailService.sendCourierRejectedEmail(
          updatedUser.email,
          updatedUser.fullName,
          reason,
        );
      } catch (emailErr) {
        this.logger.error(
          `Failed to send courier rejection email to ${updatedUser.email}: ${(emailErr as Error).message}`,
        );
      }
    }

    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.EMAIL,
            recipientUserId: updatedUser.id,
            template: 'courier_rejected',
            title: 'Courier application rejected',
            description: `Application could not be approved: ${reason}`,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (notifErr) {
        this.logger.error(
          `Failed to record courier rejection notification for ${updatedUser.id}: ${(notifErr as Error).message}`,
        );
      }
    }

    return updatedUser;
  }

  async approveMerchant(
    merchantId: string,
    reviewedBy?: string,
  ): Promise<User> {
    const user = await this.usersRepository.findMerchantById(merchantId);
    if (!user) {
      throw new NotFoundException('Merchant not found');
    }
    if (user.role !== Role.MERCHANT) {
      throw new BadRequestException('User is not a merchant');
    }

    const updatedUser = await this.usersRepository.approveUser(
      merchantId,
      reviewedBy,
    );

    if (this.emailService) {
      try {
        await this.emailService.sendMerchantApprovedEmail(
          updatedUser.email,
          updatedUser.fullName,
          user.merchantProfile?.businessName,
        );
      } catch (emailErr) {
        this.logger.error(
          `Failed to send merchant approval email to ${updatedUser.email}: ${(emailErr as Error).message}`,
        );
      }
    }

    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: updatedUser.id,
            template: 'merchant_approved',
            title: 'Your merchant account is now approved!',
            description:
              'Log in to access API keys, manage orders, and set up webhooks.',
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });

        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.EMAIL,
            recipientUserId: updatedUser.id,
            template: 'merchant_approved',
            title: 'Your merchant account is now approved!',
            description:
              'Log in to access API keys, manage orders, and set up webhooks.',
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (notifErr) {
        this.logger.error(
          `Failed to record merchant approval notification for ${updatedUser.id}: ${(notifErr as Error).message}`,
        );
      }
    }

    return updatedUser;
  }

  async rejectMerchant(
    merchantId: string,
    reason: string,
    reviewedBy?: string,
  ): Promise<User> {
    const user = await this.usersRepository.findMerchantById(merchantId);
    if (!user) {
      throw new NotFoundException('Merchant not found');
    }
    if (user.role !== Role.MERCHANT) {
      throw new BadRequestException('User is not a merchant');
    }

    const updatedUser = await this.usersRepository.rejectUser(
      merchantId,
      reason,
      reviewedBy,
    );

    if (this.emailService) {
      try {
        await this.emailService.sendMerchantRejectedEmail(
          updatedUser.email,
          updatedUser.fullName,
          reason,
          user.merchantProfile?.businessName,
        );
      } catch (emailErr) {
        this.logger.error(
          `Failed to send merchant rejection email to ${updatedUser.email}: ${(emailErr as Error).message}`,
        );
      }
    }

    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.EMAIL,
            recipientUserId: updatedUser.id,
            template: 'merchant_rejected',
            title: 'Merchant application rejected',
            description: `Application could not be approved: ${reason}`,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (notifErr) {
        this.logger.error(
          `Failed to record merchant rejection notification for ${updatedUser.id}: ${(notifErr as Error).message}`,
        );
      }
    }

    return updatedUser;
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    if (!this.prisma) {
      throw new BadRequestException('Database service is unavailable');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.deliveryStatusNotifications !== undefined
          ? { deliveryStatusNotifications: dto.deliveryStatusNotifications }
          : {}),
        ...(dto.failedDeliveryNotifications !== undefined
          ? { failedDeliveryNotifications: dto.failedDeliveryNotifications }
          : {}),
        ...(dto.storeConnectionNotifications !== undefined
          ? { storeConnectionNotifications: dto.storeConnectionNotifications }
          : {}),
      },
    });

    const eventId = randomUUID();
    await this.prisma.notification.create({
      data: {
        eventId,
        channel: NotificationChannel.IN_APP,
        recipientUserId: userId,
        template: 'preferences_updated',
        title: 'Preferences updated',
        description: 'Your notification preferences have been saved.',
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      },
    });

    return {
      deliveryStatusNotifications: updated.deliveryStatusNotifications,
      failedDeliveryNotifications: updated.failedDeliveryNotifications,
      storeConnectionNotifications: updated.storeConnectionNotifications,
      message: 'Your notification preferences have been saved.',
    };
  }
}
