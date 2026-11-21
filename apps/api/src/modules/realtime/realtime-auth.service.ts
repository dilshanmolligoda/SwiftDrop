import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApprovalStatus } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard.js';
import { AUTH_COOKIE_NAME, parseCookies } from '../auth/utils/cookie.util.js';
import { UsersService } from '../users/users.service.js';

export interface SocketIdentity {
  readonly user: AuthenticatedUser;
  /** When the access token expires (ms since epoch); the socket is closed then. */
  readonly expiresAt: number | null;
}

export interface HandshakeLike {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly auth?: Record<string, unknown>;
}

/**
 * Authenticates a socket the same way REST does: the httpOnly access-token
 * cookie (browsers) or `auth.token` (non-browser clients), verified with
 * JWT_ACCESS_SECRET, then the live account state like ApprovalGuard.
 *
 * Returns null for anonymous or invalid credentials — the gateway then only
 * allows public tracking, it never trusts unverified claims.
 */
@Injectable()
export class RealtimeAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {}

  async identify(handshake: HandshakeLike): Promise<SocketIdentity | null> {
    const token = this.tokenFrom(handshake);
    if (!token) return null;

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      return null;
    }
    if (!payload.sub || !payload.role) return null;

    // Live check, like ApprovalGuard: deactivated or unapproved accounts get no data.
    const account = await this.users.findById(payload.sub);
    if (
      !account ||
      !account.isActive ||
      account.approvalStatus !== ApprovalStatus.APPROVED
    ) {
      return null;
    }

    return {
      user: {
        id: account.id,
        email: account.email,
        role: account.role,
        approvalStatus: account.approvalStatus,
      },
      expiresAt: typeof payload.exp === 'number' ? payload.exp * 1000 : null,
    };
  }

  private tokenFrom(handshake: HandshakeLike): string | null {
    const explicit = handshake.auth?.token;
    if (typeof explicit === 'string' && explicit.length > 0) {
      return explicit.replace(/^Bearer\s+/i, '');
    }
    const cookieHeader = handshake.headers.cookie;
    const cookies = parseCookies(
      Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader,
    );
    return cookies[AUTH_COOKIE_NAME] || null;
  }
}
