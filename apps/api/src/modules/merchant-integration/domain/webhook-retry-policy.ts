/**
 * Decides what happens after each webhook delivery attempt.
 *
 * - 2xx                                → delivered
 * - no response (timeout / network), 408, 429, 5xx → retry later
 * - any other status (400, 401, 404 …) → failed, retrying would not help
 *
 * Retry delays grow 4× each time. With WEBHOOK_BACKOFF_BASE_MS=30000 and
 * WEBHOOK_MAX_ATTEMPTS=6: 30s, 2m, 8m, 32m, ~2h, then dead-letter.
 */

export type WebhookAttemptOutcome = 'DELIVERED' | 'RETRYABLE' | 'FAILED';

export interface WebhookRetryConfig {
  /** Total attempts including the first one (WEBHOOK_MAX_ATTEMPTS). */
  readonly maxAttempts: number;
  /** Delay before the first retry (WEBHOOK_BACKOFF_BASE_MS). */
  readonly backoffBaseMs: number;
}

export type WebhookNextStep =
  | { readonly action: 'DONE' }
  | { readonly action: 'RETRY'; readonly delayMs: number }
  | { readonly action: 'DEAD_LETTER'; readonly reason: DeadLetterReason };

export type DeadLetterReason = 'NON_RETRYABLE_STATUS' | 'MAX_ATTEMPTS_REACHED';

const BACKOFF_MULTIPLIER = 4;

/** @param statusCode HTTP status, or null when no response arrived. */
export function classifyWebhookResponse(
  statusCode: number | null,
): WebhookAttemptOutcome {
  if (statusCode === null) {
    return 'RETRYABLE';
  }
  if (statusCode >= 200 && statusCode < 300) {
    return 'DELIVERED';
  }
  if (statusCode === 408 || statusCode === 429 || statusCode >= 500) {
    return 'RETRYABLE';
  }
  return 'FAILED';
}

/**
 * Delay before the next attempt, or null when no attempts are left.
 *
 * @param failedAttempt 1-based number of the attempt that just failed.
 */
export function getRetryDelayMs(
  failedAttempt: number,
  config: WebhookRetryConfig,
): number | null {
  assertValidConfig(config);
  if (!Number.isInteger(failedAttempt) || failedAttempt < 1) {
    throw new Error('failedAttempt must be a positive integer');
  }
  if (failedAttempt >= config.maxAttempts) {
    return null;
  }
  return config.backoffBaseMs * BACKOFF_MULTIPLIER ** (failedAttempt - 1);
}

export function decideNextWebhookStep(
  statusCode: number | null,
  attempt: number,
  config: WebhookRetryConfig,
): WebhookNextStep {
  const outcome = classifyWebhookResponse(statusCode);
  if (outcome === 'DELIVERED') {
    return { action: 'DONE' };
  }
  if (outcome === 'FAILED') {
    return { action: 'DEAD_LETTER', reason: 'NON_RETRYABLE_STATUS' };
  }

  const delayMs = getRetryDelayMs(attempt, config);
  return delayMs === null
    ? { action: 'DEAD_LETTER', reason: 'MAX_ATTEMPTS_REACHED' }
    : { action: 'RETRY', delayMs };
}

function assertValidConfig(config: WebhookRetryConfig): void {
  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1) {
    throw new Error('maxAttempts must be a positive integer');
  }
  if (!Number.isFinite(config.backoffBaseMs) || config.backoffBaseMs <= 0) {
    throw new Error('backoffBaseMs must be a positive number');
  }
}
