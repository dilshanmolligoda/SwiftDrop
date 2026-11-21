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

  validateMessagingEnv(config);

  return config;
}

/** Positive-integer settings for the outbox relay, with an upper bound each. */
const MESSAGING_INT_LIMITS: Record<string, number> = {
  OUTBOX_POLL_INTERVAL_MS: 60_000,
  OUTBOX_BATCH_SIZE: 500,
  OUTBOX_PUBLISH_TIMEOUT_MS: 60_000,
};

/**
 * Without RabbitMQ the API still works (events wait in outbox_events), which
 * is fine for local development but would silently stop notifications and
 * webhooks in production — so production refuses to start without it.
 */
function validateMessagingEnv(config: Record<string, unknown>) {
  const url =
    typeof config.RABBITMQ_URL === 'string' ? config.RABBITMQ_URL.trim() : '';

  if (config.NODE_ENV === 'production' && !url) {
    throw new Error(
      'RABBITMQ_URL is required in production: without it no notifications or webhooks are sent.',
    );
  }
  if (url && !/^amqps?:\/\//.test(url)) {
    throw new Error('RABBITMQ_URL must start with amqp:// or amqps://');
  }
  // Local RabbitMQ containers often really use the example password, so the
  // placeholder is only refused in production.
  if (config.NODE_ENV === 'production' && url && /<change-me/i.test(url)) {
    throw new Error('RABBITMQ_URL still contains a <change-me> placeholder.');
  }

  for (const [key, max] of Object.entries(MESSAGING_INT_LIMITS)) {
    const raw = config[key];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > max) {
      throw new Error(`${key} must be a whole number between 1 and ${max}.`);
    }
  }

  const relay = config.OUTBOX_RELAY_ENABLED;
  if (relay !== undefined && relay !== 'true' && relay !== 'false') {
    throw new Error('OUTBOX_RELAY_ENABLED must be "true" or "false".');
  }
}
