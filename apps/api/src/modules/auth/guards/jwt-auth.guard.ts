import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';
import type { Role, ApprovalStatus } from '../../../generated/prisma/enums.js';
import { AUTH_COOKIE_NAME, parseCookies } from '../utils/cookie.util.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  approvalStatus?: ApprovalStatus;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser; cookies?: unknown }>();

    let token: string | undefined;

    // 1. Check Bearer token in Authorization header (preserves non-browser API client support)
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [scheme, headerToken] = authHeader.split(' ');
      if (scheme === 'Bearer' && headerToken) {
        token = headerToken;
      } else {
        throw new UnauthorizedException(
          'Malformed authorization header. Expected Bearer <token>',
        );
      }
    }

    // 2. If no Bearer header, check HTTP-only cookie
    if (!token) {
      const reqWithCookies = request as { cookies?: Record<string, string> };
      const cookies =
        reqWithCookies.cookies && typeof reqWithCookies.cookies === 'object'
          ? reqWithCookies.cookies
          : parseCookies(request.headers.cookie);
      token = cookies[AUTH_COOKIE_NAME] || cookies['swiftdrop_access_token'];
    }

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    try {
      const secret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
        algorithms: ['HS256'],
      });

      if (!payload.sub || !payload.role) {
        throw new UnauthorizedException(
          'Token payload is missing required claims',
        );
      }

      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        approvalStatus: payload.approvalStatus,
      };

      return true;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired authorization token');
    }
  }
}
