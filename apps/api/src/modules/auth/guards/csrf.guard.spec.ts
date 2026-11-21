import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CsrfGuard } from './csrf.guard.js';

describe('CsrfGuard', () => {
  let guard: CsrfGuard;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'CORS_ORIGINS')
            return 'http://localhost:5173,https://app.swiftdrop.local';
          return defaultValue;
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsrfGuard,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    guard = module.get<CsrfGuard>(CsrfGuard);
  });

  const createMockContext = (
    method: string,
    origin?: string,
    referer?: string,
    cookies?: Record<string, string>,
    cookieHeader?: string,
  ): ExecutionContext => {
    const request = {
      method,
      headers: {
        origin,
        referer,
        cookie: cookieHeader,
      },
      cookies,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('allows safe HTTP GET/HEAD/OPTIONS requests regardless of origin', () => {
    expect(
      guard.canActivate(createMockContext('GET', 'http://unauthorized.com')),
    ).toBe(true);
    expect(
      guard.canActivate(createMockContext('HEAD', 'http://unauthorized.com')),
    ).toBe(true);
    expect(
      guard.canActivate(
        createMockContext('OPTIONS', 'http://unauthorized.com'),
      ),
    ).toBe(true);
  });

  it('allows state-changing POST requests with authorized Origin', () => {
    const context = createMockContext('POST', 'http://localhost:5173');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows cookie-authenticated POST with an approved Origin', () => {
    const context = createMockContext(
      'POST',
      'http://localhost:5173',
      undefined,
      { access_token: 'valid.jwt.cookie' },
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects state-changing POST requests with unauthorized Origin with 403 Forbidden', () => {
    const context = createMockContext('POST', 'http://evil-attacker.com');
    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException(
        'Cross-origin request rejected: unauthorized origin',
      ),
    );
  });

  it('rejects cookie-authenticated POST with an unapproved Origin with 403 Forbidden', () => {
    const context = createMockContext(
      'POST',
      'http://evil-attacker.com',
      undefined,
      { access_token: 'valid.jwt.cookie' },
    );
    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException(
        'Cross-origin request rejected: unauthorized origin',
      ),
    );
  });

  it('rejects cookie-authenticated POST without Origin and Referer with 403 Forbidden', () => {
    const context = createMockContext('POST', undefined, undefined, {
      access_token: 'session.cookie.jwt',
    });
    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException(
        'Cross-origin request rejected: missing origin for cookie-authenticated request',
      ),
    );
  });

  it('rejects cookie-authenticated POST without Origin/Referer when cookie is in headers.cookie', () => {
    const context = createMockContext(
      'POST',
      undefined,
      undefined,
      undefined,
      'other=1; access_token=header.cookie.jwt',
    );
    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException(
        'Cross-origin request rejected: missing origin for cookie-authenticated request',
      ),
    );
  });

  it('allows state-changing requests with authorized Referer when Origin is omitted', () => {
    const context = createMockContext(
      'POST',
      undefined,
      'http://localhost:5173/some/path?query=1',
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects state-changing requests with unauthorized Referer with 403 Forbidden', () => {
    const context = createMockContext(
      'POST',
      undefined,
      'http://attacker.com/malicious',
    );
    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException(
        'Cross-origin request rejected: unauthorized referer',
      ),
    );
  });

  it('allows non-browser Bearer-token requests without Origin and Referer when no cookie is present', () => {
    const context = createMockContext('POST', undefined, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });
});
