import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Role } from '../../../generated/prisma/enums.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: { verifyAsync: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };
  let configService: { getOrThrow: jest.Mock };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    reflector = { getAllAndOverride: jest.fn() };
    configService = {
      getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: JwtService, useValue: jwtService },
        { provide: Reflector, useValue: reflector },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  interface MockRequest {
    headers: { authorization?: string };
    user?: AuthenticatedUser;
  }

  const createMockContext = (authHeader?: string): ExecutionContext => {
    const request: MockRequest = {
      headers: {
        authorization: authHeader,
      },
      user: undefined,
    };

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: (): MockRequest => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access to public routes without token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext();

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('allows access and attaches user when a valid bearer token is provided', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext('Bearer valid-jwt-token');

    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-uuid-1',
      email: 'user@example.com',
      role: Role.CUSTOMER,
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-jwt-token', {
      secret: 'test-jwt-secret',
      algorithms: ['HS256'],
    });

    const req = context.switchToHttp().getRequest<MockRequest>();
    expect(req.user).toEqual({
      id: 'user-uuid-1',
      email: 'user@example.com',
      role: Role.CUSTOMER,
    });
  });

  it('throws UnauthorizedException when authorization header is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing authorization token'),
    );
  });

  it('throws UnauthorizedException when authorization header is malformed', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext('Basic some-credentials');

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(
        'Malformed authorization header. Expected Bearer <token>',
      ),
    );
  });

  it('throws UnauthorizedException when token is invalid or expired', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext('Bearer expired-or-invalid-token');

    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or expired authorization token'),
    );
  });

  it('throws UnauthorizedException when token uses an unsupported algorithm', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext('Bearer token-with-unsupported-alg');

    jwtService.verifyAsync.mockRejectedValue(
      new Error('invalid algorithm: RS256 is not allowed'),
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or expired authorization token'),
    );
  });

  it('throws UnauthorizedException when token payload is missing required claims', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext('Bearer token-without-claims');

    jwtService.verifyAsync.mockResolvedValue({
      email: 'incomplete@example.com',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Token payload is missing required claims'),
    );
  });
});
