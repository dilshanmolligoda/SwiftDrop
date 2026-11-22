/**
 * Format rules for a merchant webhook URL, checked when it is saved (API) and
 * again before every delivery (worker). This is only the syntax check — the
 * worker also refuses addresses on private networks at connect time
 * (see `@swiftdrop/contracts/node` → isPublicAddress).
 */

export const MAX_WEBHOOK_URL_LENGTH = 2048;

export interface WebhookUrlOptions {
  /** Production: only https. Dev: http is allowed (e.g. the mock merchant). */
  readonly requireHttps: boolean;
}

export type WebhookUrlCheck =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly error: string };

export function checkWebhookUrl(
  raw: string,
  options: WebhookUrlOptions,
): WebhookUrlCheck {
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_WEBHOOK_URL_LENGTH) {
    return fail(`URL must be 1-${MAX_WEBHOOK_URL_LENGTH} characters`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail('URL is not valid');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fail('URL must use https:// (or http:// in development)');
  }
  if (options.requireHttps && url.protocol !== 'https:') {
    return fail('URL must use https://');
  }
  if (url.username || url.password) {
    return fail('URL must not contain a username or password');
  }
  if (!url.hostname) {
    return fail('URL must have a host');
  }
  return { ok: true, url };
}

function fail(error: string): WebhookUrlCheck {
  return { ok: false, error };
}
