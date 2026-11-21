import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from './roles.guard.js';
import { Role } from '../../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, { provide: Reflector, useValue: reflector }],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
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

  it('allows access when no roles are required on route', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext({
      id: 'user-1',
      email: 'user@example.com',
      role: Role.CUSTOMER,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('accepts an ADMIN where ADMIN is required', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const context = createMockContext({
      id: 'admin-1',
      email: 'admin@example.com',
      role: Role.ADMIN,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a CUSTOMER with 403 Forbidden where ADMIN is required', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const context = createMockContext({
      id: 'customer-1',
      email: 'customer@example.com',
      role: Role.CUSTOMER,
    });

    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Forbidden resource: insufficient permissions'),
    );
  });

  it('accepts an allowed role when multiple roles are permissible', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN, Role.COURIER]);
    const context = createMockContext({
      id: 'courier-1',
      email: 'courier@example.com',
      role: Role.COURIER,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects with UnauthorizedException when user identity is missing on protected route', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Authentication required'),
    );
  });
});
