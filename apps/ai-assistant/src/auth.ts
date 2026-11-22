export async function resolveUser(cookieHeader?: string) {
  const token = parseCookie(cookieHeader)['access_token'];
  if (!token) return null;
  const res = await fetch(`${config.apiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const me = await res.json() as { role: string; fullName: string };
  if (me.role !== 'CUSTOMER' && me.role !== 'MERCHANT') return null;
  return { token, role: me.role as 'CUSTOMER' | 'MERCHANT', fullName: me.fullName };
}
