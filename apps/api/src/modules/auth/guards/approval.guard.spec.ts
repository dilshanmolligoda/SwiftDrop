import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalGuard } from './approval.guard.js';
import { Role, ApprovalStatus } from '../../../generated/prisma/enums.js';
import { UsersService } from '../../users/users.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ALLOW_UNAPPROVED_KEY } from '../decorators/allow-unapproved.decorator.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

describe('ApprovalGuard', () => {
  let guard: ApprovalGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let usersService: { findById: jest.Mock };

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn() };
    usersService = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalGuard,
        { provide: Reflector, useValue: reflector },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    guard = module.get<ApprovalGuard>(ApprovalGuard);
  });

  const createMockContext = (user?: AuthenticatedUser): ExecutionContext => {
    const request = { user };

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access immediately when route is decorated with @Public()', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return true;
      return undefined;
    });

    const context = createMockContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('allows access when no user is present on request (delegated to JwtAuthGuard)', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    const context = createMockContext(undefined);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('allows access to normal protected routes for APPROVED users', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    usersService.findById.mockResolvedValue({
      id: 'approved-user',
      role: Role.MERCHANT,
      approvalStatus: ApprovalStatus.APPROVED,
      isActive: true,
    });

    const context = createMockContext({
      id: 'approved-user',
      email: 'merchant@example.com',
      role: Role.MERCHANT,
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('blocks PENDING applicants from normal routes with 403 Forbidden', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    usersService.findById.mockResolvedValue({
      id: 'pending-user',
      role: Role.COURIER,
      approvalStatus: ApprovalStatus.PENDING,
      isActive: true,
    });

    const context = createMockContext({
      id: 'pending-user',
      email: 'courier@example.com',
      role: Role.COURIER,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('blocks REJECTED applicants from normal routes with 403 Forbidden', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    usersService.findById.mockResolvedValue({
      id: 'rejected-user',
      role: Role.MERCHANT,
      approvalStatus: ApprovalStatus.REJECTED,
      isActive: true,
    });

    const context = createMockContext({
      id: 'rejected-user',
      email: 'merchant@example.com',
      role: Role.MERCHANT,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows PENDING applicants to access @AllowUnapproved() routes', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === ALLOW_UNAPPROVED_KEY) return true;
      return false;
    });
    usersService.findById.mockResolvedValue({
      id: 'pending-user',
      role: Role.COURIER,
      approvalStatus: ApprovalStatus.PENDING,
      isActive: true,
    });

    const context = createMockContext({
      id: 'pending-user',
      email: 'courier@example.com',
      role: Role.COURIER,
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('allows REJECTED applicants to access @AllowUnapproved() routes', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === ALLOW_UNAPPROVED_KEY) return true;
      return false;
    });
    usersService.findById.mockResolvedValue({
      id: 'rejected-user',
      role: Role.MERCHANT,
      approvalStatus: ApprovalStatus.REJECTED,
      isActive: true,
    });

    const context = createMockContext({
      id: 'rejected-user',
      email: 'merchant@example.com',
      role: Role.MERCHANT,
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('throws UnauthorizedException when user is inactive in database', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    usersService.findById.mockResolvedValue({
      id: 'inactive-user',
      role: Role.CUSTOMER,
      approvalStatus: ApprovalStatus.APPROVED,
      isActive: false,
    });

    const context = createMockContext({
      id: 'inactive-user',
      email: 'customer@example.com',
      role: Role.CUSTOMER,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when user is not found in database', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    usersService.findById.mockResolvedValue(null);

    const context = createMockContext({
      id: 'ghost-user',
      email: 'ghost@example.com',
      role: Role.CUSTOMER,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

