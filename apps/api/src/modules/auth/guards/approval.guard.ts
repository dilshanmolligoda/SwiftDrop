import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ALLOW_UNAPPROVED_KEY } from '../decorators/allow-unapproved.decorator.js';
import { UsersService } from '../../users/users.service.js';
import { ApprovalStatus } from '../../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

@Injectable()
export class ApprovalGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const allowUnapproved = this.reflector.getAllAndOverride<boolean>(
      ALLOW_UNAPPROVED_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      return true;
    }

    // Always fetch the live approval status from the database using user ID
    const dbUser = await this.usersService.findById(user.id);
    if (!dbUser || !dbUser.isActive) {
      throw new UnauthorizedException('User not found or account is inactive');
    }

    if (dbUser.approvalStatus === ApprovalStatus.APPROVED) {
      return true;
    }

    // Non-approved applicants can only access endpoints explicitly decorated with @AllowUnapproved()
    if (allowUnapproved) {
      return true;
    }

    throw new ForbiddenException(
      'Account approval is required to access this resource',
    );
  }
}

