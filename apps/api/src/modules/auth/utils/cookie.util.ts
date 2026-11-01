import type { Response, Request, NextFunction, CookieOptions } from 'express';
import type { ConfigService } from '@nestjs/config';

export const AUTH_COOKIE_NAME = 'access_token';
export const AUTH_COOKIE_PATH = '/api';

/**
 * Lightweight RFC 6265 cookie header parser.
 * Populates key-value pairs without requiring external dependencies.
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');

  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }

  return cookies;
}

/**
 * Express middleware to ensure req.cookies is available on all requests.
 */
export function cookieParserMiddleware(
  req: Request & { cookies?: Record<string, string> },
  _res: Response,
  next: NextFunction,
) {
  if (!req.cookies) {
    req.cookies = parseCookies(req.headers.cookie);
  }
  next();
}

/**
 * Determines whether cookies must be marked Secure.
 * Fail-safe policy:
 * - 'development' explicitly permits HTTP localhost testing with secure: false.
 * - 'test' permits automated tests with secure: false.
 * - Every other environment, including undefined or unexpected NODE_ENV, defaults to secure: true.
 */
export function isSecureCookie(configService: ConfigService): boolean {
  const nodeEnv = configService.get<string>('NODE_ENV')?.trim().toLowerCase();
  if (nodeEnv === 'development' || nodeEnv === 'test') {
    return false;
  }
  return true;
}

/**
 * Returns security-hardened options for the authentication cookie.
 */
export function getAuthCookieOptions(
  configService: ConfigService,
  expiresInSeconds: number,
): CookieOptions {
  const secure = isSecureCookie(configService);
  const cookiePath = configService.get<string>(
    'AUTH_COOKIE_PATH',
    AUTH_COOKIE_PATH,
  );

  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: cookiePath,
    maxAge: expiresInSeconds * 1000,
    expires: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

/**
 * Returns matching options to clear the authentication cookie upon logout.
 */
export function getClearAuthCookieOptions(
  configService: ConfigService,
): CookieOptions {
  const secure = isSecureCookie(configService);
  const cookiePath = configService.get<string>(
    'AUTH_COOKIE_PATH',
    AUTH_COOKIE_PATH,
  );

  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: cookiePath,
  };
}
