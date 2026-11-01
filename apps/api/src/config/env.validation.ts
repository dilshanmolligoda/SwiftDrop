const REQUIRED = ['DATABASE_URL', 'JWT_ACCESS_SECRET'] as const;

/** Minimum byte length for JWT_ACCESS_SECRET (256 bits / 8 = 32 bytes). */
const JWT_SECRET_MIN_BYTES = 32;

/**
 * Patterns that indicate a developer left in a placeholder value instead of
 * replacing it with a real secret.  Comparison is case-insensitive.
 */
const JWT_SECRET_PLACEHOLDER_PATTERNS = [
  /^<change-me/i,
  /^change[-_]?me/i,
  /^your[-_]?secret/i,
  /^secret$/i,
  /^changethis/i,
];

export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy .env.example to .env in the repo root and in apps/api.',
    );
  }

  // --- JWT_ACCESS_SECRET strength validation ---
  const secret = config['JWT_ACCESS_SECRET'] as string;

  if (Buffer.byteLength(secret, 'utf8') < JWT_SECRET_MIN_BYTES) {
    throw new Error(
      `JWT_ACCESS_SECRET must be at least ${JWT_SECRET_MIN_BYTES} bytes long. ` +
        "Generate a strong secret with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }

  if (JWT_SECRET_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(secret))) {
    throw new Error(
      'JWT_ACCESS_SECRET appears to be a placeholder value. ' +
        'Replace it with a cryptographically random secret before starting the application.',
    );
  }

  return config;
}
