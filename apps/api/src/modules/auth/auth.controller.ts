import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  AuthService,
  type ApplicationStatusResponseDto,
  type UserProfile,
  type UserSummary,
} from './auth.service.js';
import {
  GoogleAuthService,
  type GoogleUserIdentity,
} from './google-auth.service.js';
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
  OAUTH_TX_COOKIE_NAME,
  getAuthCookieOptions,
  getClearAuthCookieOptions,
  getOAuthTxCookieOptions,
  getClearOAuthTxCookieOptions,
  parseCookies,
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
    @Optional() private readonly googleAuthService?: GoogleAuthService,
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

  @Public()
  @Get('google')
  googleSignIn(@Res() res: Response): void {
    const webAppUrl = this.configService.get<string>(
      'WEB_APP_URL',
      'http://localhost:5173',
    );

    if (!this.googleAuthService || !this.googleAuthService.isConfigured()) {
      res.redirect(`${webAppUrl}/login?error=google_not_configured`);
      return;
    }

    try {
      const { authUrl, cookieValue } =
        this.googleAuthService.createOAuthTransaction('signin');
      const cookieOptions = getOAuthTxCookieOptions(this.configService);
      res.cookie(OAUTH_TX_COOKIE_NAME, cookieValue, cookieOptions);
      res.redirect(authUrl);
    } catch {
      res.redirect(`${webAppUrl}/login?error=google_auth_failed`);
    }
  }

  @Get('google/link')
  googleLink(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): void {
    const webAppUrl = this.configService.get<string>(
      'WEB_APP_URL',
      'http://localhost:5173',
    );

    if (!this.googleAuthService || !this.googleAuthService.isConfigured()) {
      res.redirect(`${webAppUrl}/login?error=google_not_configured`);
      return;
    }

    try {
      const { authUrl, cookieValue } =
        this.googleAuthService.createOAuthTransaction('link', user.id);
      const cookieOptions = getOAuthTxCookieOptions(this.configService);
      res.cookie(OAUTH_TX_COOKIE_NAME, cookieValue, cookieOptions);
      res.redirect(authUrl);
    } catch {
      res.redirect(`${webAppUrl}/login?error=google_link_failed`);
    }
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') googleError?: string,
  ): Promise<void> {
    const webAppUrl = this.configService.get<string>(
      'WEB_APP_URL',
      'http://localhost:5173',
    );

    const cookies =
      req.cookies && typeof req.cookies === 'object'
        ? (req.cookies as Record<string, string>)
        : parseCookies(req.headers.cookie);

    const cookieValue = cookies[OAUTH_TX_COOKIE_NAME];
    const clearTxOptions = getClearOAuthTxCookieOptions(this.configService);

    if (!this.googleAuthService || !cookieValue) {
      res.clearCookie(OAUTH_TX_COOKIE_NAME, clearTxOptions);
      res.redirect(`${webAppUrl}/login?error=oauth_missing_state`);
      return;
    }

    const tx = this.googleAuthService.verifyTransactionCookie(cookieValue);
    if (!tx) {
      res.clearCookie(OAUTH_TX_COOKIE_NAME, clearTxOptions);
      res.redirect(`${webAppUrl}/login?error=oauth_invalid_state`);
      return;
    }

    const isLink = tx.intent === 'link';
    let linkUserDashboardUrl: string | null = null;
    if (isLink && tx.linkUserId) {
      linkUserDashboardUrl = await this.authService.resolveLinkUserDashboardUrl(
        tx.linkUserId,
      );
    }

    const errorRedirectBase =
      isLink && linkUserDashboardUrl
        ? linkUserDashboardUrl
        : `${webAppUrl}/login`;
    const errorParamName =
      isLink && linkUserDashboardUrl ? 'link_error' : 'error';

    if (!state || state !== tx.state) {
      res.clearCookie(OAUTH_TX_COOKIE_NAME, clearTxOptions);
      res.redirect(
        `${errorRedirectBase}?${errorParamName}=oauth_invalid_state`,
      );
      return;
    }

    if (googleError) {
      res.clearCookie(OAUTH_TX_COOKIE_NAME, clearTxOptions);
      res.redirect(`${errorRedirectBase}?${errorParamName}=access_denied`);
      return;
    }

    if (!code) {
      res.clearCookie(OAUTH_TX_COOKIE_NAME, clearTxOptions);
      res.redirect(`${errorRedirectBase}?${errorParamName}=missing_code`);
      return;
    }

    let identity: GoogleUserIdentity;
    try {
      identity = await this.googleAuthService.exchangeAndVerify(
        code,
        tx.codeVerifier,
        tx.nonce,
      );
    } catch {
      res.clearCookie(OAUTH_TX_COOKIE_NAME, clearTxOptions);
      res.redirect(
        `${errorRedirectBase}?${errorParamName}=oauth_verification_failed`,
      );
      return;
    }

    res.clearCookie(OAUTH_TX_COOKIE_NAME, clearTxOptions);

    if (tx.intent === 'signin') {
      try {
        const result = await this.authService.handleGoogleSignIn(identity);

        if (result.type === 'authenticated') {
          const cookieOptions = getAuthCookieOptions(
            this.configService,
            result.loginResult.expiresIn,
          );
          res.cookie(
            AUTH_COOKIE_NAME,
            result.loginResult.accessToken,
            cookieOptions,
          );
        }

        res.redirect(result.redirectUrl);
      } catch {
        res.redirect(`${webAppUrl}/login?error=google_signin_failed`);
      }
      return;
    }

    if (tx.intent === 'link') {
      if (!tx.linkUserId) {
        res.redirect(`${webAppUrl}/login?error=link_user_missing`);
        return;
      }

      try {
        const result = await this.authService.handleGoogleLink(
          tx.linkUserId,
          identity,
        );
        res.redirect(result.redirectUrl);
      } catch {
        res.redirect(
          `${errorRedirectBase}?${errorParamName}=google_link_failed`,
        );
      }
      return;
    }
  }
}
