import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  AuthService,
  type ApplicationStatusResponseDto,
  type UserProfile,
  type UserSummary,
} from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterCustomerDto } from './dto/register-customer.dto.js';
import { RegisterMerchantDto } from './dto/register-merchant.dto.js';
import { RegisterCourierDto } from './dto/register-courier.dto.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { AllowUnapproved } from './decorators/allow-unapproved.decorator.js';
import {
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
  getClearAuthCookieOptions,
} from './utils/cookie.util.js';

export interface LoginResponseDto {
  expiresIn: number;
  user: UserSummary;
}

export interface RegisterResponseDto {
  expiresIn: number;
  user: UserSummary;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.authService.login(dto);

    // Set secure HTTP-only authentication cookie
    const cookieOptions = getAuthCookieOptions(
      this.configService,
      result.expiresIn,
    );
    res.cookie(AUTH_COOKIE_NAME, result.accessToken, cookieOptions);

    // Return safe user summary and non-secret metadata (accessToken is never exposed in JSON)
    return {
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('register/customer')
  @HttpCode(HttpStatus.CREATED)
  async registerCustomer(
    @Body() dto: RegisterCustomerDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegisterResponseDto> {
    const result = await this.authService.registerCustomer(dto);

    const cookieOptions = getAuthCookieOptions(
      this.configService,
      result.expiresIn,
    );
    res.cookie(AUTH_COOKIE_NAME, result.accessToken, cookieOptions);

    return {
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('register/merchant')
  @HttpCode(HttpStatus.CREATED)
  async registerMerchant(
    @Body() dto: RegisterMerchantDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegisterResponseDto> {
    const result = await this.authService.registerMerchant(dto);

    const cookieOptions = getAuthCookieOptions(
      this.configService,
      result.expiresIn,
    );
    res.cookie(AUTH_COOKIE_NAME, result.accessToken, cookieOptions);

    return {
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('register/courier')
  @HttpCode(HttpStatus.CREATED)
  async registerCourier(
    @Body() dto: RegisterCourierDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegisterResponseDto> {
    const result = await this.authService.registerCourier(dto);

    const cookieOptions = getAuthCookieOptions(
      this.configService,
      result.expiresIn,
    );
    res.cookie(AUTH_COOKIE_NAME, result.accessToken, cookieOptions);

    return {
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @AllowUnapproved()
  @Get('me')
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserProfile> {
    return this.authService.getProfile(user.id);
  }

  @AllowUnapproved()
  @Get('application-status')
  async getApplicationStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicationStatusResponseDto> {
    return this.authService.getApplicationStatus(user.id);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response): { message: string } {
    const clearOptions = getClearAuthCookieOptions(this.configService);
    res.clearCookie(AUTH_COOKIE_NAME, clearOptions);

    return { message: 'Logged out successfully' };
  }
}
