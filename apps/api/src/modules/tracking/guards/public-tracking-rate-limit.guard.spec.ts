import { type ExecutionContext, HttpException } from '@nestjs/common';
import {
  PUBLIC_TRACKING_GLOBAL_LIMIT,
  PUBLIC_TRACKING_MAX_ADDRESSES,
  PUBLIC_TRACKING_PER_ADDRESS_LIMIT,
  PUBLIC_TRACKING_WINDOW_MS,
  PublicTrackingRateLimitGuard,
} from './public-tracking-rate-limit.guard.js';

describe('PublicTrackingRateLimitGuard', () => {
  let guard: PublicTrackingRateLimitGuard;
  let now: number;

  beforeEach(() => {
    guard = new PublicTrackingRateLimitGuard();
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => jest.restoreAllMocks());

  function context(
    address: string | null = '192.0.2.1',
    forwardedFor?: string,
  ) {
    const headers = new Map<string, string>();
    const request = {
      socket: { remoteAddress: address ?? undefined },
      ip: forwardedFor ?? address,
      headers: { 'x-forwarded-for': forwardedFor },
      params: { trackingNumber: 'SD-private-test-value' },
    };
    return {
      headers,
      value: {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => ({
            setHeader: (name: string, value: string) =>
              headers.set(name, value),
          }),
        }),
      } as unknown as ExecutionContext,
    };
  }

  function expectLimited(value: ExecutionContext): HttpException {
    let thrown: unknown;
    try {
      guard.canActivate(value);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    const error = thrown as HttpException;
    expect(error.getStatus()).toBe(429);
    expect(error.message).toBe(
      'Too many tracking requests. Please try again later.',
    );
    expect(JSON.stringify(error.getResponse())).not.toMatch(/SD-|192\.0\.2/);
    return error;
  }

  it('allows twenty requests per direct peer and rejects the twenty-first', () => {
    const http = context();
    for (let index = 0; index < PUBLIC_TRACKING_PER_ADDRESS_LIMIT; index++) {
      expect(guard.canActivate(http.value)).toBe(true);
    }
    expectLimited(http.value);
    expect(http.headers.get('Retry-After')).toBe('60');
    expect(guard.canActivate(context('192.0.2.2').value)).toBe(true);
  });

  it('does not accept a spoofed forwarded address or request.ip as a new identity', () => {
    for (let index = 0; index < PUBLIC_TRACKING_PER_ADDRESS_LIMIT; index++) {
      guard.canActivate(context('192.0.2.1', `203.0.113.${index}`).value);
    }
    expectLimited(context('192.0.2.1', '203.0.113.250').value);
  });

  it('uses one bounded bucket when no direct peer address is available', () => {
    for (let index = 0; index < PUBLIC_TRACKING_PER_ADDRESS_LIMIT; index++) {
      guard.canActivate(context(null, `203.0.113.${index}`).value);
    }
    expectLimited(context(null, '203.0.113.250').value);
  });

  it('caps permitted requests globally even across changing peers', () => {
    for (let index = 0; index < PUBLIC_TRACKING_GLOBAL_LIMIT; index++) {
      guard.canActivate(context(`peer-${index}`).value);
    }
    const http = context('new-peer');
    expectLimited(http.value);
    expect(http.headers.get('Retry-After')).toBe('60');
    now += PUBLIC_TRACKING_WINDOW_MS;
    expect(guard.canActivate(http.value)).toBe(true);
  });

  it('retains the existing per-peer window after an independent global reset', () => {
    guard.canActivate(context('earlier-peer').value);
    now += 30_000;
    const http = context('later-peer');
    for (let index = 0; index < PUBLIC_TRACKING_PER_ADDRESS_LIMIT; index++) {
      guard.canActivate(http.value);
    }
    now += 30_000;
    expectLimited(http.value);
    expect(http.headers.get('Retry-After')).toBe('30');
    now += 30_000;
    expect(guard.canActivate(http.value)).toBe(true);
  });

  it('rounds Retry-After upward and resets counters at the exact expiry', () => {
    const http = context();
    for (let index = 0; index < PUBLIC_TRACKING_PER_ADDRESS_LIMIT; index++) {
      guard.canActivate(http.value);
    }
    now += 58_001;
    expectLimited(http.value);
    expect(http.headers.get('Retry-After')).toBe('2');
    now += 1_998;
    expectLimited(http.value);
    expect(http.headers.get('Retry-After')).toBe('1');
    now++;
    expect(guard.canActivate(http.value)).toBe(true);
  });

  it('sets privacy headers on allowed and limited requests without echoing input', () => {
    const http = context();
    guard.canActivate(http.value);
    expect(http.headers.get('Cache-Control')).toBe('no-store');
    expect(http.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(http.headers.has('Retry-After')).toBe(false);
    for (let index = 1; index < PUBLIC_TRACKING_PER_ADDRESS_LIMIT; index++) {
      guard.canActivate(http.value);
    }
    expectLimited(http.value);
    expect(http.headers.get('Cache-Control')).toBe('no-store');
    expect(http.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('counts arbitrary requests without depending on DTO validity or tracking format', () => {
    const http = context();
    // Guard runs before parameter pipes and deliberately never reads params.
    for (let index = 0; index < PUBLIC_TRACKING_PER_ADDRESS_LIMIT; index++) {
      guard.canActivate(http.value);
    }
    expectLimited(http.value);
  });

  it('rejects new peers at capacity without evicting live counters and reclaims expired entries', () => {
    // The global cap normally keeps this far below its absolute memory ceiling.
    // Seed the private map only in this isolated test to exercise defense in depth.
    const clients = Reflect.get(guard, 'clients') as Map<
      string,
      { count: number; resetAt: number }
    >;
    for (let index = 0; index < PUBLIC_TRACKING_MAX_ADDRESSES; index++) {
      clients.set(`existing-${index}`, {
        count: 1,
        resetAt: now + PUBLIC_TRACKING_WINDOW_MS,
      });
    }
    Reflect.set(guard, 'nextCleanupAt', now + PUBLIC_TRACKING_WINDOW_MS);
    const http = context('overflow-peer');
    expectLimited(http.value);
    expect(clients.size).toBe(PUBLIC_TRACKING_MAX_ADDRESSES);
    expect(clients.has('existing-0')).toBe(true);
    expect(guard.canActivate(context('existing-0').value)).toBe(true);
    expect(clients.get('existing-0')?.count).toBe(2);
    now += PUBLIC_TRACKING_WINDOW_MS;
    expect(guard.canActivate(http.value)).toBe(true);
    expect(clients.size).toBe(1);
    expect(clients.has('overflow-peer')).toBe(true);
  });
});
