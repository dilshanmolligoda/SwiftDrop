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

  private async createAuthSession(user: {
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

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.usersService.findById(userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or account is inactive');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      approvalStatus: user.approvalStatus,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
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
