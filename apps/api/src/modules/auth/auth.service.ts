import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { PasswordService } from './password.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterCustomerDto } from './dto/register-customer.dto.js';
import { RegisterMerchantDto } from './dto/register-merchant.dto.js';
import { RegisterCourierDto } from './dto/register-courier.dto.js';
import { normalizePhoneNumber } from './utils/phone.util.js';
import {
  Role,
  ApprovalStatus,
  VehicleType,
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
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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
