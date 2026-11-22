import { config } from '../config.js';

type QueryValue = string | number | boolean | undefined;

export interface ApiCallOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, QueryValue>;
  body?: unknown;
}

export type ApiResult = Record<string, unknown> & { error?: string; status?: number };

export type ApiCall = (path: string, opts?: ApiCallOptions) => Promise<ApiResult>;

/**
 * Thin client over the SwiftDrop REST API. Forwards the user's JWT as a
 * Bearer token so the API's own role and ownership rules still apply.
 * Never throws: failures come back as `{ error, status }` so the LLM can
 * explain them to the user.
 */
export function createApi(token?: string): ApiCall {
  return async (path, opts = {}) => {
    const url = new URL(config.apiUrl.replace(/\/$/, '') + path);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      // The API uses forbidNonWhitelisted, so never send empty params
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(8000),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) return data;
      const message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
      return { error: typeof message === 'string' ? message : `HTTP ${res.status}`, status: res.status };
    } catch {
      return { error: 'The SwiftDrop API is unreachable right now.', status: 0 };
    }
  };
}
