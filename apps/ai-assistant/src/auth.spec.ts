import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCookie, resolveUser } from './auth.js';

function mockMe(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseCookie', () => {
  it('parses multiple cookies and decodes values', () => {
    expect(parseCookie('a=1; access_token=abc%2E123; b=x')).toEqual({
      a: '1',
      access_token: 'abc.123',
      b: 'x',
    });
  });

  it('returns an empty object for a missing header', () => {
    expect(parseCookie(undefined)).toEqual({});
  });
});

describe('resolveUser', () => {
  it('returns null without calling the API when there is no session cookie', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await resolveUser('other=1')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when /auth/me rejects the token', async () => {
    mockMe(401, { message: 'Unauthorized' });
    expect(await resolveUser('access_token=bad')).toBeNull();
  });

  it('returns null for roles other than customer and merchant', async () => {
    mockMe(200, { role: 'COURIER', fullName: 'C', approvalStatus: 'APPROVED' });
    expect(await resolveUser('access_token=t')).toBeNull();
  });

  it('returns null for merchants that are not approved yet', async () => {
    mockMe(200, { role: 'MERCHANT', fullName: 'M', approvalStatus: 'PENDING' });
    expect(await resolveUser('access_token=t')).toBeNull();
  });

  it('returns the user and forwards the token as a Bearer header', async () => {
    const fetchSpy = mockMe(200, { role: 'CUSTOMER', fullName: 'Nimal', approvalStatus: 'APPROVED' });

    expect(await resolveUser('access_token=tok123')).toEqual({
      token: 'tok123',
      role: 'CUSTOMER',
      fullName: 'Nimal',
    });
    const [, init] = fetchSpy.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok123');
  });

  it('returns null when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await resolveUser('access_token=t')).toBeNull();
  });
});
