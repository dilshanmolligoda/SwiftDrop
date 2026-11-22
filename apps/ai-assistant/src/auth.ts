import { config } from './config.js';

/** Must match AUTH_COOKIE_NAME in apps/api/src/modules/auth/utils/cookie.util.ts */
const AUTH_COOKIE_NAME = 'access_token';

export type ChatRole = 'CUSTOMER' | 'MERCHANT';

export interface ChatUser {
  token: string;
  role: ChatRole;
  fullName: string;
}

export function parseCookie(header?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

/**
 * Reads the API's HttpOnly session cookie and asks the API who the user is.
 * Only approved customers and merchants may use the assistant.
 */
export async function resolveUser(cookieHeader?: string): Promise<ChatUser | null> {
  const token = parseCookie(cookieHeader)[AUTH_COOKIE_NAME];
  if (!token) return null;

  try {
    const res = await fetch(`${config.apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const me = (await res.json()) as { role?: string; fullName?: string; approvalStatus?: string };
    if (me.role !== 'CUSTOMER' && me.role !== 'MERCHANT') return null;
    if (me.approvalStatus && me.approvalStatus !== 'APPROVED') return null;

    return { token, role: me.role, fullName: me.fullName ?? '' };
  } catch {
    return null;
  }
}
