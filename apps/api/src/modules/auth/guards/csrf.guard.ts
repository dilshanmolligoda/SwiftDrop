import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AUTH_COOKIE_NAME, parseCookies } from '../utils/cookie.util.js';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // Safe read-only HTTP methods do not modify server state
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    const originsConfig = this.configService.get<string>(
      'CORS_ORIGINS',
      'http://localhost:5173',
    );
    const allowedOrigins = originsConfig
      .split(',')
      .map((o) => o.trim().toLowerCase())
      .filter(Boolean);

    const originHeader = request.headers.origin;
    if (originHeader) {
      const normalizedOrigin = originHeader.trim().toLowerCase();
      if (!allowedOrigins.includes(normalizedOrigin)) {
        throw new ForbiddenException(
          'Cross-origin request rejected: unauthorized origin',
        );
      }
      return true;
    }

    const refererHeader = request.headers.referer;
    if (refererHeader) {
      let refererOrigin: string;
      try {
        refererOrigin = new URL(refererHeader).origin.toLowerCase();
      } catch {
        throw new ForbiddenException(
          'Cross-origin request rejected: malformed referer',
        );
      }

      if (!allowedOrigins.includes(refererOrigin)) {
        throw new ForbiddenException(
          'Cross-origin request rejected: unauthorized referer',
        );
      }
      return true;
    }

    // When both Origin and Referer are absent:
    // Reject if an authentication cookie is present, as browser cookie-based
    // requests must present a verifiable Origin or Referer for state changes.
    const reqWithCookies = request as { cookies?: Record<string, string> };
    const cookies =
      reqWithCookies.cookies && typeof reqWithCookies.cookies === 'object'
        ? reqWithCookies.cookies
        : parseCookies(request.headers.cookie);

    const hasAuthCookie = Boolean(
      cookies[AUTH_COOKIE_NAME] || cookies['swiftdrop_access_token'],
    );

    if (hasAuthCookie) {
      throw new ForbiddenException(
        'Cross-origin request rejected: missing origin for cookie-authenticated request',
      );
    }

    // Allow non-browser API clients (Bearer token clients, automated calls) without cookies
    return true;
  }
}
