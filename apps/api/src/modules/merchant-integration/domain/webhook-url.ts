/**
 * Checks a merchant's webhook URL before SwiftDrop starts calling it.
 *
 * In production only public HTTPS URLs are accepted, so the server cannot be
 * pointed at itself or at internal services (SSRF). Local development also
 * allows http:// and localhost, so the mock merchant store can receive webhooks.
 */

const MAX_URL_LENGTH = 2048;

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/,
  /\.localhost$/,
  /\.local$/,
  /\.internal$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/,
  /^\[?fe80:/,
];

export type WebhookUrlCheck =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: string };

export function checkWebhookUrl(
  raw: string,
  options: { readonly allowLocal: boolean },
): WebhookUrlCheck {
  const value = raw?.trim() ?? '';
  if (!value) {
    return { ok: false, reason: 'Webhook URL is required' };
  }
  if (value.length > MAX_URL_LENGTH) {
    return { ok: false, reason: 'Webhook URL is too long' };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'Webhook URL is not a valid URL' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'Webhook URL must start with https://' };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      reason: 'Webhook URL must not contain a username or password',
    };
  }

  if (!options.allowLocal) {
    if (url.protocol !== 'https:') {
      return { ok: false, reason: 'Webhook URL must use https://' };
    }
    const host = url.hostname.toLowerCase();
    if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
      return {
        ok: false,
        reason: 'Webhook URL must point to a public internet address',
      };
    }
  }

  url.hash = '';
  return { ok: true, url: url.toString() };
}
