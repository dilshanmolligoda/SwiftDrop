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
});
