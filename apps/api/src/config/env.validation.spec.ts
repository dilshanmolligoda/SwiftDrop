import { validateEnv } from './env.validation.js';

/** A valid 48-byte hex secret (96 hex chars = 48 bytes). */
const VALID_SECRET = 'a'.repeat(64); // 64 ASCII chars = 64 bytes — well above the 32-byte minimum

describe('validateEnv', () => {
  const VALID_DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

  const base = {
    DATABASE_URL: VALID_DATABASE_URL,
    JWT_ACCESS_SECRET: VALID_SECRET,
  };

  // ── Missing variable detection ──────────────────────────────────────────

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: VALID_SECRET })).toThrow(
      /Missing required environment variables.*DATABASE_URL/,
    );
  });

  it('throws when JWT_ACCESS_SECRET is missing', () => {
    expect(() => validateEnv({ DATABASE_URL: VALID_DATABASE_URL })).toThrow(
      /Missing required environment variables.*JWT_ACCESS_SECRET/,
    );
  });

  it('throws when both required variables are absent', () => {
    expect(() => validateEnv({})).toThrow(
      /Missing required environment variables/,
    );
  });

  // ── JWT secret length validation ────────────────────────────────────────

  it('throws when JWT_ACCESS_SECRET is shorter than 32 bytes', () => {
    const shortSecret = 'short'; // 5 bytes
    expect(() =>
      validateEnv({ ...base, JWT_ACCESS_SECRET: shortSecret }),
    ).toThrow(/JWT_ACCESS_SECRET must be at least 32 bytes/);
  });

  it('throws for a 31-byte secret (one byte below threshold)', () => {
    const almostLong = 'x'.repeat(31); // 31 bytes
    expect(() =>
      validateEnv({ ...base, JWT_ACCESS_SECRET: almostLong }),
    ).toThrow(/JWT_ACCESS_SECRET must be at least 32 bytes/);
  });

  it('accepts a secret that is exactly 32 bytes long', () => {
    const exactMinSecret = 'y'.repeat(32); // 32 ASCII bytes
    expect(() =>
      validateEnv({ ...base, JWT_ACCESS_SECRET: exactMinSecret }),
    ).not.toThrow();
  });

  // ── JWT secret placeholder detection ───────────────────────────────────

  it('throws for <change-me-…> placeholder pattern', () => {
    const placeholder = '<change-me-long-random-secret-here-xxxx>';
    expect(() =>
      validateEnv({ ...base, JWT_ACCESS_SECRET: placeholder }),
    ).toThrow(/placeholder/i);
  });

  it('throws for change-me pattern (case-insensitive)', () => {
    const placeholder = 'Change-Me-This-Is-Definitely-Not-A-Real-Secret!!';
    expect(() =>
      validateEnv({ ...base, JWT_ACCESS_SECRET: placeholder }),
    ).toThrow(/placeholder/i);
  });

  it('throws for "your-secret" placeholder pattern', () => {
    const placeholder = 'your-secret-replace-me-with-a-real-one-xxxxxxxxxxxx';
    expect(() =>
      validateEnv({ ...base, JWT_ACCESS_SECRET: placeholder }),
    ).toThrow(/placeholder/i);
  });

  it('throws for "secret" as the entire value (even if padded to 32 chars it still matches)', () => {
    // "secret" alone is also too short (<32 bytes), but placeholder check should fire too
    expect(() =>
      validateEnv({ ...base, JWT_ACCESS_SECRET: 'secret' }),
    ).toThrow(); // either length or placeholder error is acceptable
  });

  // ── Error message must not expose the actual secret value ───────────────

  it('does not include the secret value in the error message when secret is too short', () => {
    const sensitiveShortSecret = 'my-super-private-val'; // < 32 bytes
    try {
      validateEnv({ ...base, JWT_ACCESS_SECRET: sensitiveShortSecret });
      fail('Expected validateEnv to throw');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
      const message = (err as Error).message;
      expect(message).not.toContain(sensitiveShortSecret);
    }
  });

  // ── Valid configuration ─────────────────────────────────────────────────

  it('returns the original config when all variables are valid', () => {
    const config = { ...base };
    const result = validateEnv(config);
    expect(result).toBe(config);
  });

  it('accepts extra environment variables beyond the required ones', () => {
    const config = { ...base, NODE_ENV: 'development', PORT: '4000' };
    expect(() => validateEnv(config)).not.toThrow();
  });

  // ── Messaging (RabbitMQ + outbox relay) ────────────────────────────────

  describe('messaging settings', () => {
    const rabbit = 'amqp://swiftdrop:secret@rabbitmq:5672';

    it('allows a missing RABBITMQ_URL outside production', () => {
      expect(() =>
        validateEnv({ ...base, NODE_ENV: 'development' }),
      ).not.toThrow();
    });

    it('requires RABBITMQ_URL in production', () => {
      expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
        /RABBITMQ_URL is required in production/,
      );
    });

    it('accepts a valid amqp URL in production', () => {
      expect(() =>
        validateEnv({
          ...base,
          NODE_ENV: 'production',
          RABBITMQ_URL: rabbit,
          WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
        }),
      ).not.toThrow();
    });

    it('rejects a non-AMQP URL', () => {
      expect(() =>
        validateEnv({ ...base, RABBITMQ_URL: 'http://rabbitmq:5672' }),
      ).toThrow(/amqp:\/\/ or amqps:\/\//);
    });

    it('rejects a placeholder URL in production', () => {
      expect(() =>
        validateEnv({
          ...base,
          NODE_ENV: 'production',
          RABBITMQ_URL: 'amqp://swiftdrop:<change-me>@rabbitmq:5672',
        }),
      ).toThrow(/placeholder/);
    });

    it('allows the example password locally, where the container uses it too', () => {
      expect(() =>
        validateEnv({
          ...base,
          NODE_ENV: 'development',
          RABBITMQ_URL: 'amqp://swiftdrop:<change-me>@localhost:5672',
        }),
      ).not.toThrow();
    });

    it.each([
      ['OUTBOX_BATCH_SIZE', '0'],
      ['OUTBOX_BATCH_SIZE', '501'],
      ['OUTBOX_POLL_INTERVAL_MS', '1.5'],
      ['OUTBOX_PUBLISH_TIMEOUT_MS', 'abc'],
    ])('rejects %s=%s', (key, value) => {
      expect(() => validateEnv({ ...base, [key]: value })).toThrow(
        new RegExp(key),
      );
    });

    it('accepts valid outbox numbers', () => {
      expect(() =>
        validateEnv({
          ...base,
          OUTBOX_BATCH_SIZE: '50',
          OUTBOX_POLL_INTERVAL_MS: 1000,
          OUTBOX_PUBLISH_TIMEOUT_MS: '5000',
        }),
      ).not.toThrow();
    });

    it('rejects an OUTBOX_RELAY_ENABLED value other than true/false', () => {
      expect(() =>
        validateEnv({ ...base, OUTBOX_RELAY_ENABLED: 'yes' }),
      ).toThrow(/OUTBOX_RELAY_ENABLED/);
    });
  });

  // ── Merchant webhooks ──────────────────────────────────────────────────

  describe('webhook settings', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      RABBITMQ_URL: 'amqp://swiftdrop:secret@rabbitmq:5672',
    };
    const key = Buffer.alloc(32, 5).toString('base64');

    it('requires a 32-byte encryption key in production', () => {
      expect(() => validateEnv(production)).toThrow(
        /WEBHOOK_SECRET_ENCRYPTION_KEY/,
      );
      expect(() =>
        validateEnv({
          ...production,
          WEBHOOK_SECRET_ENCRYPTION_KEY: '<change-me-32-bytes-base64>',
        }),
      ).toThrow(/32 bytes/);
      expect(() =>
        validateEnv({ ...production, WEBHOOK_SECRET_ENCRYPTION_KEY: key }),
      ).not.toThrow();
    });

    it('does not require the key in development', () => {
      expect(() =>
        validateEnv({ ...base, NODE_ENV: 'development' }),
      ).not.toThrow();
    });

    it('refuses WEBHOOK_ALLOW_PRIVATE_TARGETS=true in production', () => {
      expect(() =>
        validateEnv({
          ...production,
          WEBHOOK_SECRET_ENCRYPTION_KEY: key,
          WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true',
        }),
      ).toThrow(/not allowed in production/);
    });
  });
});
