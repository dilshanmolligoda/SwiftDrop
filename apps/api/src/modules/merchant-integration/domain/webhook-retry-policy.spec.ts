import {
  classifyWebhookResponse,
  decideNextWebhookStep,
  getRetryDelayMs,
  WebhookRetryConfig,
} from './webhook-retry-policy.js';

const CONFIG: WebhookRetryConfig = { maxAttempts: 6, backoffBaseMs: 30_000 };

describe('webhook-retry-policy', () => {
  describe('classifyWebhookResponse', () => {
    it.each([200, 201, 204, 299])('treats %i as delivered', (status) => {
      expect(classifyWebhookResponse(status)).toBe('DELIVERED');
    });

    it.each([408, 429, 500, 502, 503])('treats %i as retryable', (status) => {
      expect(classifyWebhookResponse(status)).toBe('RETRYABLE');
    });

    it('treats no response (timeout or network error) as retryable', () => {
      expect(classifyWebhookResponse(null)).toBe('RETRYABLE');
    });

    it.each([301, 400, 401, 403, 404, 422])(
      'treats %i as failed without retry',
      (status) => {
        expect(classifyWebhookResponse(status)).toBe('FAILED');
      },
    );
  });

  describe('getRetryDelayMs', () => {
    it('grows the delay 4x after each failed attempt', () => {
      const delays = [1, 2, 3, 4, 5].map((attempt) =>
        getRetryDelayMs(attempt, CONFIG),
      );
      expect(delays).toEqual([30_000, 120_000, 480_000, 1_920_000, 7_680_000]);
    });

    it('returns null when the last allowed attempt has failed', () => {
      expect(getRetryDelayMs(6, CONFIG)).toBeNull();
      expect(getRetryDelayMs(7, CONFIG)).toBeNull();
    });

    it('rejects invalid attempt numbers and config', () => {
      expect(() => getRetryDelayMs(0, CONFIG)).toThrow();
      expect(() => getRetryDelayMs(1.5, CONFIG)).toThrow();
      expect(() =>
        getRetryDelayMs(1, { maxAttempts: 0, backoffBaseMs: 1000 }),
      ).toThrow();
      expect(() =>
        getRetryDelayMs(1, { maxAttempts: 3, backoffBaseMs: 0 }),
      ).toThrow();
    });
  });

  describe('decideNextWebhookStep', () => {
    it('is done when the merchant returns 2xx', () => {
      expect(decideNextWebhookStep(200, 1, CONFIG)).toEqual({ action: 'DONE' });
    });

    it('schedules a retry after a 503', () => {
      expect(decideNextWebhookStep(503, 2, CONFIG)).toEqual({
        action: 'RETRY',
        delayMs: 120_000,
      });
    });

    it('dead-letters a non-retryable status straight away', () => {
      expect(decideNextWebhookStep(404, 1, CONFIG)).toEqual({
        action: 'DEAD_LETTER',
        reason: 'NON_RETRYABLE_STATUS',
      });
    });

    it('dead-letters when the retry limit is reached', () => {
      expect(decideNextWebhookStep(null, 6, CONFIG)).toEqual({
        action: 'DEAD_LETTER',
        reason: 'MAX_ATTEMPTS_REACHED',
      });
    });
  });
});
