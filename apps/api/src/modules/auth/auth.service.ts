import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { UsersService } from '../users/users.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { PasswordService } from './password.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterCustomerDto } from './dto/register-customer.dto.js';
import { RegisterMerchantDto } from './dto/register-merchant.dto.js';
import { RegisterCourierDto } from './dto/register-courier.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { normalizePhoneNumber } from './utils/phone.util.js';
import {
  Role,
  ApprovalStatus,
  VehicleType,
  NotificationChannel,
  NotificationStatus,
} from '../../generated/prisma/enums.js';
import type { JwtPayload } from './guards/jwt-auth.guard.js';
import type { GoogleUserIdentity } from './google-auth.service.js';

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  approvalStatus: ApprovalStatus;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserSummary;
}

export type LoginResponse = LoginResult;

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  role: Role;
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  isGoogleLinked?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationStatusResponseDto {
  approvalStatus: ApprovalStatus;
  status: ApprovalStatus;
  role: Role;
  submittedAt: Date;
  createdAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
}

export function parseTtlToSeconds(ttl: string | number): number {
  if (typeof ttl === 'number') {
    return ttl;
  }
  const match = ttl.match(/^(\d+)([smhd])?$/i);
  if (!match) {
    return 900;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2]?.toLowerCase();
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return value;
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly consumedResetTokens = new Set<string>();

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async createAuthSession(user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    approvalStatus: ApprovalStatus;
  }): Promise<LoginResult> {
    const secret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    const ttlConfig = this.configService.get<string | number>(
      'JWT_ACCESS_TTL',
      '15m',
    );
    const expiresInSeconds = parseTtlToSeconds(ttlConfig);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      approvalStatus: user.approvalStatus,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret,
      expiresIn: expiresInSeconds,
      algorithm: 'HS256',
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: expiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        approvalStatus: user.approvalStatus,
      },
    };
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);

    // Generic error to prevent email and account existence enumeration
    const invalidCredentialsError = new UnauthorizedException(
      'Invalid email or password',
    );

    if (!user) {
      throw invalidCredentialsError;
    }

    if (!user.passwordHash) {
      throw invalidCredentialsError;
    }

    const isPasswordValid = await this.passwordService.verify(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw invalidCredentialsError;
    }

    // Inactive accounts receive generic error to prevent account enumeration
    if (!user.isActive) {
      throw invalidCredentialsError;
    }

    return this.createAuthSession({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      approvalStatus: user.approvalStatus,
    });
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user) {
      return { message: 'If the email exists, a reset link was sent' };
    }

    const secret =
      this.configService.get<string>('JWT_RESET_SECRET') ||
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');

    const token = await this.jwtService.signAsync(
      {
        sub: user.id,
        userId: user.id,
        purpose: 'password_reset',
      },
      {
        secret,
        expiresIn: '15m',
        algorithm: 'HS256',
      },
    );

    if (this.emailService) {
      try {
        await this.emailService.sendPasswordResetEmail(
          user.email,
          token,
          user.fullName,
        );
      } catch (error) {
        this.logger.error(
          `Failed to dispatch password reset email to ${user.email}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }

    return { message: 'If the email exists, a reset link was sent' };
  }

  invalidateRefreshTokens(userId: string): Promise<void> {
    this.logger.log(`Invalidating active refresh tokens for user ${userId}`);
    return Promise.resolve();
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    if (this.consumedResetTokens.has(dto.token)) {
      throw new BadRequestException(
        'Password reset token has already been used',
      );
    }

    const secret =
      this.configService.get<string>('JWT_RESET_SECRET') ||
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');

    let payload: { sub?: string; userId?: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.token, {
        secret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    if (payload.purpose !== 'password_reset') {
      throw new BadRequestException('Invalid password reset token purpose');
    }

    const userId = payload.userId || payload.sub;
    if (!userId) {
      throw new BadRequestException('Invalid password reset token payload');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Mark reset token as consumed to prevent token replay
    this.consumedResetTokens.add(dto.token);

    // Hash the new password using PasswordService
    const newPasswordHash = await this.passwordService.hash(dto.newPassword);

    // Update passwordHash in Prisma
    if (this.prisma) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      });
    }

    // Invalidate existing refresh tokens
    await this.invalidateRefreshTokens(user.id);

    // Send security notification email
    if (this.emailService) {
      try {
        await this.emailService.sendPasswordResetConfirmationEmail(
          user.email,
          user.fullName,
        );
      } catch (error) {
        this.logger.error(
          `Failed to dispatch password reset confirmation email to ${user.email}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }

    // Insert in-app and email notifications in Prisma
    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: user.id,
            template: 'password_reset_success',
            title: 'Password updated',
            description: 'Your account password was successfully reset.',
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });

        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.EMAIL,
            recipientUserId: user.id,
            template: 'password_reset_success',
            title: 'Password updated',
            description: 'Your account password was successfully reset.',
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

    return { message: 'Password has been reset successfully' };
  }

  async registerCustomer(dto: RegisterCustomerDto): Promise<LoginResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const normalizedPhone = normalizePhoneNumber(dto.phoneNumber);

    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException(
        'An account with this email address already exists',
      );
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      const user = await this.usersService.createCustomer({
        email: normalizedEmail,
        fullName: dto.fullName.trim(),
        phoneNumber: normalizedPhone,
        passwordHash,
      });

      if (this.emailService) {
        try {
          await this.emailService.sendCustomerWelcomeEmail(
            user.email,
            user.fullName,
          );

          if (this.prisma) {
            await this.prisma.notification.create({
              data: {
                eventId: randomUUID(),
                channel: NotificationChannel.EMAIL,
                recipientUserId: user.id,
                template: 'customer_welcome',
                title: 'Welcome to SwiftDrop!',
                description:
                  'Your customer account is active. Start by booking your first delivery.',
                status: NotificationStatus.SENT,
                sentAt: new Date(),
              },
            });

            await this.prisma.notification.create({
              data: {
                eventId: randomUUID(),
                channel: NotificationChannel.IN_APP,
                recipientUserId: user.id,
                template: 'customer_welcome',
                title: 'Welcome to SwiftDrop!',
                description:
                  'Your customer account is active. Start by booking your first delivery.',
                status: NotificationStatus.SENT,
                sentAt: new Date(),
              },
            });
          }
        } catch (emailError) {
          this.logger.error(
            `Failed to dispatch welcome email or record notification for ${user.email}: ${(emailError as Error).message}`,
            (emailError as Error).stack,
          );
          if (this.prisma) {
            await this.prisma.notification
              .create({
                data: {
                  eventId: randomUUID(),
                  channel: NotificationChannel.EMAIL,
                  recipientUserId: user.id,
                  template: 'customer_welcome',
                  title: 'Welcome to SwiftDrop!',
                  description:
                    'Your customer account is active. Start by booking your first delivery.',
                  status: NotificationStatus.FAILED,
                  errorMessage: (emailError as Error).message,
                },
              })
              .catch(() => undefined);

            await this.prisma.notification
              .create({
                data: {
                  eventId: randomUUID(),
                  channel: NotificationChannel.IN_APP,
                  recipientUserId: user.id,
                  template: 'customer_welcome',
                  title: 'Welcome to SwiftDrop!',
                  description:
                    'Your customer account is active. Start by booking your first delivery.',
                  status: NotificationStatus.SENT,
                  sentAt: new Date(),
                },
              })
              .catch(() => undefined);
          }
        }
      }

      return this.createAuthSession({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        approvalStatus: user.approvalStatus,
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email address already exists',
        );
      }
      throw error;
    }
  }

  async registerMerchant(dto: RegisterMerchantDto): Promise<LoginResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const normalizedPhone = normalizePhoneNumber(dto.phoneNumber);

    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException(
        'An account with this email address already exists',
      );
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      const user = await this.usersService.createMerchant({
        email: normalizedEmail,
        fullName: dto.fullName.trim(),
        phoneNumber: normalizedPhone,
        passwordHash,
        businessName: dto.businessName.trim(),
        businessAddress: dto.businessAddress.trim(),
        businessType: dto.businessType.trim(),
      });

      if (this.emailService) {
        try {
          await this.emailService.sendMerchantRegistrationReceivedEmail(
            user.email,
            user.fullName,
            dto.businessName.trim(),
          );
        } catch (emailErr) {
          this.logger.error(
            `Failed to send merchant registration email to ${user.email}: ${(emailErr as Error).message}`,
          );
        }
      }

      if (this.prisma) {
        try {
          await this.prisma.notification.create({
            data: {
              eventId: randomUUID(),
              channel: NotificationChannel.IN_APP,
              recipientUserId: user.id,
              template: 'merchant_registration_submitted',
              title: 'Account pending admin verification',
              description:
                'Your merchant business details have been received and are pending administrator verification.',
              status: NotificationStatus.SENT,
              sentAt: new Date(),
            },
          });

          await this.prisma.notification.create({
            data: {
              eventId: randomUUID(),
              channel: NotificationChannel.EMAIL,
              recipientUserId: user.id,
              template: 'merchant_registration_submitted',
              title: 'Account pending admin verification',
              description:
                'Your merchant business details have been received and are pending administrator verification.',
              status: NotificationStatus.SENT,
              sentAt: new Date(),
            },
          });
        } catch (notifErr) {
          this.logger.error(
            `Failed to record merchant registration notification for ${user.id}: ${(notifErr as Error).message}`,
          );
        }
      }

      await this.notifyAdminsNewRegistration(user.fullName, 'Merchant');

      return this.createAuthSession({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        approvalStatus: user.approvalStatus,
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email address already exists',
        );
      }
      throw error;
    }
  }

  async registerCourier(dto: RegisterCourierDto): Promise<LoginResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const normalizedPhone = normalizePhoneNumber(dto.phoneNumber);

    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException(
        'An account with this email address already exists',
      );
    }

    if (dto.vehicleType !== VehicleType.BICYCLE) {
      if (!dto.licensePlate || dto.licensePlate.trim().length === 0) {
        throw new BadRequestException(
          'Vehicle registration number is required for motorized vehicles',
        );
      }
      if (!dto.licenseNumber || dto.licenseNumber.trim().length === 0) {
        throw new BadRequestException(
          'Driving licence number is required for motorized vehicles',
        );
      }
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      const user = await this.usersService.createCourier({
        email: normalizedEmail,
        fullName: dto.fullName.trim(),
        phoneNumber: normalizedPhone,
        passwordHash,
        vehicleType: dto.vehicleType,
        licensePlate: dto.licensePlate?.trim() || null,
        licenseNumber: dto.licenseNumber?.trim() || null,
      });

      if (this.emailService) {
        try {
          await this.emailService.sendCourierRegistrationReceivedEmail(
            user.email,
            user.fullName,
          );
        } catch (emailErr) {
          this.logger.error(
            `Failed to send courier registration confirmation email to ${user.email}: ${(emailErr as Error).message}`,
          );
        }
      }

      if (this.prisma) {
        try {
          await this.prisma.notification.create({
            data: {
              eventId: randomUUID(),
              channel: NotificationChannel.IN_APP,
              recipientUserId: user.id,
              template: 'courier_registration_submitted',
              title: 'Application pending admin review',
              description:
                'Thank you for applying. Your license and vehicle details are under administrator review.',
              status: NotificationStatus.SENT,
              sentAt: new Date(),
            },
          });
        } catch (notifErr) {
          this.logger.error(
            `Failed to record in-app notification for courier registration ${user.id}: ${(notifErr as Error).message}`,
          );
        }
      }

      await this.notifyAdminsNewRegistration(user.fullName, 'Courier');

      return this.createAuthSession({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        approvalStatus: user.approvalStatus,
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email address already exists',
        );
      }
      throw error;
    }
  }

  private async notifyAdminsNewRegistration(
    applicantName: string,
    accountType: 'Courier' | 'Merchant',
  ): Promise<void> {
    if (!this.prisma) return;

    try {
      const admins = await this.prisma.user.findMany({
        where: { role: Role.ADMIN, isActive: true },
        select: { id: true, email: true, fullName: true },
      });

      for (const admin of admins) {
        if (this.emailService) {
          try {
            await this.emailService.sendAdminAccountAwaitingReviewEmail(
              admin.email,
              admin.fullName,
              applicantName,
              accountType,
            );
          } catch (emailErr) {
            this.logger.error(
              `Failed to send admin notification email to ${admin.email}: ${(emailErr as Error).message}`,
            );
          }
        }

        const eventId = randomUUID();
        const description = `Action required: New registration from ${applicantName} awaiting review.`;

        await this.prisma.notification.createMany({
          data: [
            {
              eventId,
              channel: NotificationChannel.EMAIL,
              recipientUserId: admin.id,
              template: 'admin_account_awaiting_review',
              title: 'New registration awaiting review',
              description,
              status: NotificationStatus.SENT,
              sentAt: new Date(),
            },
            {
              eventId,
              channel: NotificationChannel.IN_APP,
              recipientUserId: admin.id,
              template: 'admin_account_awaiting_review',
              title: 'New registration awaiting review',
              description,
              status: NotificationStatus.SENT,
              sentAt: new Date(),
            },
          ],
          skipDuplicates: true,
        });
      }
    } catch (err: unknown) {
      this.logger.error(
        `Failed to notify admins of new registration for ${applicantName}: ${(err as Error).message}`,
      );
    }
  }

  getRoleDashboardUrl(role: Role, approvalStatus: ApprovalStatus): string {
    const webAppUrl = this.configService.get<string>(
      'WEB_APP_URL',
      'http://localhost:5173',
    );
    if (
      approvalStatus === ApprovalStatus.PENDING ||
      approvalStatus === ApprovalStatus.REJECTED
    ) {
      return `${webAppUrl}/application-status`;
    }
    switch (role) {
      case Role.CUSTOMER:
        return `${webAppUrl}/customer/dashboard`;
      case Role.MERCHANT:
        return `${webAppUrl}/merchant/dashboard`;
      case Role.COURIER:
        return `${webAppUrl}/courier/dashboard`;
      case Role.ADMIN:
      case Role.DISPATCHER:
        return `${webAppUrl}/admin-landing`;
      default:
        return `${webAppUrl}/customer/dashboard`;
    }
  }

  async resolveLinkUserDashboardUrl(userId?: string): Promise<string | null> {
    if (!userId) {
      return null;
    }
    try {
      const user = await this.usersService.findById(userId);
      if (!user || !user.isActive) {
        return null;
      }
      return this.getRoleDashboardUrl(user.role, user.approvalStatus);
    } catch {
      return null;
    }
  }

  async handleGoogleSignIn(identity: GoogleUserIdentity): Promise<
    | {
        type: 'authenticated';
        loginResult: LoginResult;
        redirectUrl: string;
      }
    | {
        type: 'account_exists_link_required';
        redirectUrl: string;
      }
    | {
        type: 'account_deactivated';
        redirectUrl: string;
      }
  > {
    const webAppUrl = this.configService.get<string>(
      'WEB_APP_URL',
      'http://localhost:5173',
    );

    // 1. Find account using Google's verified sub (googleSubject)
    const userByGoogle = await this.usersService.findByGoogleSubject(
      identity.googleSubject,
    );

    if (userByGoogle) {
      if (!userByGoogle.isActive) {
        return {
          type: 'account_deactivated',
          redirectUrl: `${webAppUrl}/login?error=account_deactivated`,
        };
      }

      const session = await this.createAuthSession({
        id: userByGoogle.id,
        email: userByGoogle.email,
        fullName: userByGoogle.fullName,
        role: userByGoogle.role,
        approvalStatus: userByGoogle.approvalStatus,
      });

      const redirectUrl = this.getRoleDashboardUrl(
        userByGoogle.role,
        userByGoogle.approvalStatus,
      );

      return {
        type: 'authenticated',
        loginResult: session,
        redirectUrl,
      };
    }

    // 2. If not found by googleSubject, check if verified email belongs to an existing SwiftDrop account
    const userByEmail = await this.usersService.findByEmail(identity.email);

    if (userByEmail) {
      // Do NOT automatically link. Require manual sign in first, then link from settings/dashboard.
      return {
        type: 'account_exists_link_required',
        redirectUrl: `${webAppUrl}/login?error=account_exists_link_required`,
      };
    }

    // 3. No existing account: create a new CUSTOMER account with APPROVED status
    const newCustomer = await this.usersService.createGoogleCustomer({
      email: identity.email,
      fullName: identity.fullName,
      googleSubject: identity.googleSubject,
    });

    // Send Google account linked email
    if (this.emailService) {
      try {
        await this.emailService.sendGoogleLinkedEmail(
          newCustomer.email,
          identity.email,
          newCustomer.fullName,
        );
      } catch (emailError) {
        this.logger.error(
          `Failed to send Google linked email to ${newCustomer.email}: ${(emailError as Error).message}`,
        );
      }
    }

    // Insert in-app and email notification records
    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: newCustomer.id,
            template: 'google_account_linked',
            title: 'Google account linked',
            description: 'You can now sign in using Google.',
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });

        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.EMAIL,
            recipientUserId: newCustomer.id,
            template: 'google_account_linked',
            title: 'Google account linked',
            description: `Your SwiftDrop profile is now connected with your Google account (${identity.email}). You can now use Login with Google.`,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (notifError) {
        this.logger.error(
          `Failed to create notification records for Google customer ${newCustomer.id}: ${(notifError as Error).message}`,
        );
      }
    }

    const session = await this.createAuthSession({
      id: newCustomer.id,
      email: newCustomer.email,
      fullName: newCustomer.fullName,
      role: newCustomer.role,
      approvalStatus: newCustomer.approvalStatus,
    });

    return {
      type: 'authenticated',
      loginResult: session,
      redirectUrl: `${webAppUrl}/customer/dashboard`,
    };
  }

  async handleGoogleLink(
    userId: string,
    identity: GoogleUserIdentity,
  ): Promise<{ redirectUrl: string }> {
    const webAppUrl = this.configService.get<string>(
      'WEB_APP_URL',
      'http://localhost:5173',
    );

    const currentUser = await this.usersService.findById(userId);
    if (!currentUser || !currentUser.isActive) {
      return {
        redirectUrl: `${webAppUrl}/login?error=account_deactivated`,
      };
    }

    const dashboardUrl = this.getRoleDashboardUrl(
      currentUser.role,
      currentUser.approvalStatus,
    );

    // Rule: Only allow linking when Google's verified email matches currently authenticated user's email
    if (identity.email.toLowerCase() !== currentUser.email.toLowerCase()) {
      return {
        redirectUrl: `${dashboardUrl}?link_error=email_mismatch`,
      };
    }

    // Rule: Never allow a Google identity already linked to another SwiftDrop account to be linked again
    const existingGoogleUser = await this.usersService.findByGoogleSubject(
      identity.googleSubject,
    );
    if (existingGoogleUser && existingGoogleUser.id !== currentUser.id) {
      return {
        redirectUrl: `${dashboardUrl}?link_error=google_already_linked`,
      };
    }

    // Rule: Never overwrite an existing Google identity association
    if (
      currentUser.googleSubject &&
      currentUser.googleSubject !== identity.googleSubject
    ) {
      return {
        redirectUrl: `${dashboardUrl}?link_error=already_has_google`,
      };
    }

    // Link the account
    await this.usersService.linkGoogleSubject(
      currentUser.id,
      identity.googleSubject,
    );

    // Send Google account linked email
    if (this.emailService) {
      try {
        await this.emailService.sendGoogleLinkedEmail(
          currentUser.email,
          identity.email,
          currentUser.fullName,
        );
      } catch (emailError) {
        this.logger.error(
          `Failed to send Google linked email to ${currentUser.email}: ${(emailError as Error).message}`,
        );
      }
    }

    // Insert in-app and email notification records
    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: currentUser.id,
            template: 'google_account_linked',
            title: 'Google account linked',
            description: 'You can now sign in using Google.',
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });

        await this.prisma.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.EMAIL,
            recipientUserId: currentUser.id,
            template: 'google_account_linked',
            title: 'Google account linked',
            description: `Your SwiftDrop profile is now connected with your Google account (${identity.email}). You can now use Login with Google.`,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (notifError) {
        this.logger.error(
          `Failed to create notification records for linked user ${currentUser.id}: ${(notifError as Error).message}`,
        );
      }
    }

    return {
      redirectUrl: `${dashboardUrl}?link_success=google_connected`,
    };
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.usersService.findById(userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or account is inactive');
    }

    const profile: UserProfile = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      approvalStatus: user.approvalStatus,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    if (user.googleSubject) {
      profile.isGoogleLinked = true;
    }

    return profile;
  }

  async getApplicationStatus(
    userId: string,
  ): Promise<ApplicationStatusResponseDto> {
    const user = await this.usersService.findById(userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or account is inactive');
    }

    return {
      approvalStatus: user.approvalStatus,
      status: user.approvalStatus,
      role: user.role,
      submittedAt: user.createdAt,
      createdAt: user.createdAt,
      reviewedAt: user.reviewedAt,
      rejectionReason: user.rejectionReason,
    };
  }
}
