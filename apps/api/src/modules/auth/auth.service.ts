import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { PasswordService } from './password.service.js';
import { LoginDto } from './dto/login.dto.js';
import type { Role, ApprovalStatus } from '../../generated/prisma/enums.js';
import type { JwtPayload } from './guards/jwt-auth.guard.js';

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserSummary;
}

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

  async login(dto: LoginDto): Promise<LoginResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);

    // Generic error to prevent email enumeration
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

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Account is inactive. Please contact support.',
      );
    }

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
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret,
      expiresIn: expiresInSeconds,
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
      },
    };
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
}
