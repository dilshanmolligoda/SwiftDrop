import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import type { UpdateMerchantContactDto } from './dto/update-contact.dto.js';
import type { ChangeMerchantPasswordDto } from './dto/change-password.dto.js';
import type { UpdateMerchantNotificationsDto } from './dto/update-notifications.dto.js';
import type { UpdateMerchantPreferencesDto } from './dto/update-preferences.dto.js';
import type { UpdateTwoFactorDto } from './dto/update-two-factor.dto.js';
import type { RequestMerchantBusinessUpdateDto } from './dto/request-business-update.dto.js';

@Injectable()
export class MerchantSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async getSettings(merchantUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: merchantUserId },
      include: { merchantProfile: true },
    });
    if (!user || !user.merchantProfile) {
      throw new NotFoundException('Merchant settings not found');
    }

    return {
      businessProfile: {
        businessName: user.merchantProfile.businessName,
        registrationNumber: user.merchantProfile.registrationNumber,
        businessAddress: user.merchantProfile.businessAddress,
        website: user.merchantProfile.website,
        businessType: user.merchantProfile.businessType,
        approved: user.approvalStatus === 'APPROVED',
      },
      contactDetails: {
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        emailAddress: user.email,
      },
      security: {
        twoFactorEnabled: user.twoFactorEnabled,
        isGoogleLinked: Boolean(user.googleSubject),
      },
      notifications: {
        deliveryStatusUpdates: user.deliveryStatusNotifications,
        failedDeliveries: user.failedDeliveryNotifications,
        storeConnectionIssues: user.storeConnectionNotifications,
      },
      preferences: {
        language: user.language,
        timeZone: user.timeZone,
      },
    };
  }

  async updateContact(merchantUserId: string, dto: UpdateMerchantContactDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing && existing.id !== merchantUserId) {
      throw new ConflictException('Email address is already in use');
    }

    const user = await this.prisma.user.update({
      where: { id: merchantUserId },
      data: {
        fullName: dto.fullName.trim(),
        phoneNumber: dto.phoneNumber?.trim() || null,
        email: normalizedEmail,
      },
    });

    return {
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      emailAddress: user.email,
    };
  }

  async changePassword(merchantUserId: string, dto: ChangeMerchantPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: merchantUserId },
    });
    if (!user?.passwordHash) {
      throw new BadRequestException(
        'Password change is unavailable for this account',
      );
    }

    const isValid = await this.passwordService.verify(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: merchantUserId },
      data: {
        passwordHash: await this.passwordService.hash(dto.newPassword),
        updatedAt: new Date(),
      },
    });

    return { message: 'Password changed successfully' };
  }

  async updateNotifications(
    merchantUserId: string,
    dto: UpdateMerchantNotificationsDto,
  ) {
    await this.prisma.user.update({
      where: { id: merchantUserId },
      data: {
        deliveryStatusNotifications: dto.deliveryStatusUpdates,
        failedDeliveryNotifications: dto.failedDeliveries,
        storeConnectionNotifications: dto.storeConnectionIssues,
      },
    });
    return dto;
  }

  async updatePreferences(
    merchantUserId: string,
    dto: UpdateMerchantPreferencesDto,
  ) {
    await this.prisma.user.update({
      where: { id: merchantUserId },
      data: {
        language: dto.language,
        timeZone: dto.timeZone,
      },
    });
    return dto;
  }

  async updateTwoFactor(merchantUserId: string, dto: UpdateTwoFactorDto) {
    await this.prisma.user.update({
      where: { id: merchantUserId },
      data: { twoFactorEnabled: dto.enabled },
    });
    return {
      twoFactorEnabled: dto.enabled,
      message: dto.enabled
        ? 'Two-step verification enabled'
        : 'Two-step verification disabled',
    };
  }

  async requestBusinessUpdate(
    merchantUserId: string,
    dto: RequestMerchantBusinessUpdateDto,
  ) {
    if (
      !Object.values(dto).some(
        (value) => typeof value === 'string' && value.trim(),
      )
    ) {
      throw new BadRequestException(
        'At least one business update field is required',
      );
    }
    const request = await this.prisma.merchantBusinessUpdateRequest.create({
      data: {
        merchantUserId,
        businessName: dto.businessName?.trim() || null,
        businessAddress: dto.businessAddress?.trim() || null,
        businessType: dto.businessType?.trim() || null,
        registrationNumber: dto.registrationNumber?.trim() || null,
        website: dto.website?.trim() || null,
      },
    });
    return {
      id: request.id,
      status: request.status,
      submittedAt: request.createdAt,
    };
  }

  async listBusinessUpdateRequests(merchantUserId: string) {
    return this.prisma.merchantBusinessUpdateRequest.findMany({
      where: { merchantUserId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        businessAddress: true,
        businessType: true,
        registrationNumber: true,
        website: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        rejectionReason: true,
      },
    });
  }

  async getVerificationDocuments(merchantUserId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId: merchantUserId },
    });
    if (!profile) {
      throw new NotFoundException('Merchant profile not found');
    }

    return {
      approved:
        (
          await this.prisma.user.findUnique({
            where: { id: merchantUserId },
            select: { approvalStatus: true },
          })
        )?.approvalStatus === 'APPROVED',
      documents: [],
    };
  }
}
