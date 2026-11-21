import { parseEncryptionKey } from '@swiftdrop/contracts/node';
import { NUMERIC_SETTINGS } from './worker.config.js';

/** The worker only reacts to RabbitMQ events, so it cannot run without both. */
const REQUIRED = ['DATABASE_URL', 'RABBITMQ_URL'] as const;

/** Fail fast at startup instead of misbehaving later. */
export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy .env.example to .env in the repo root (and to apps/worker/.env with ' +
        '@localhost hosts when running outside Docker).',
    );
  }

  const url = String(config.RABBITMQ_URL).trim();
  if (!/^amqps?:\/\//.test(url)) {
    throw new Error('RABBITMQ_URL must start with amqp:// or amqps://');
  }
  if (config.NODE_ENV === 'production' && /<change-me/i.test(url)) {
    throw new Error('RABBITMQ_URL still contains a <change-me> placeholder.');
  }

  for (const [key, { max }] of Object.entries(NUMERIC_SETTINGS)) {
    const raw = config[key];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > max) {
      throw new Error(`${key} must be a whole number between 1 and ${max}.`);
    }
  }

  validateWebhookEnv(config);

  return config;
}

function validateWebhookEnv(config: Record<string, unknown>) {
  const production = config.NODE_ENV === 'production';
  const allowPrivate = config.WEBHOOK_ALLOW_PRIVATE_TARGETS;

  if (
    allowPrivate !== undefined &&
    allowPrivate !== 'true' &&
    allowPrivate !== 'false'
  ) {
    throw new Error('WEBHOOK_ALLOW_PRIVATE_TARGETS must be "true" or "false".');
  }
  if (production && allowPrivate === 'true') {
    throw new Error(
      'WEBHOOK_ALLOW_PRIVATE_TARGETS=true is not allowed in production; ' +
        'list specific hosts in WEBHOOK_PRIVATE_HOST_ALLOWLIST instead.',
    );
  }

  // In development a missing key only disables webhooks (logged at startup);
  // in production merchants would silently get nothing, so refuse to start.
  if (production) {
    try {
      parseEncryptionKey(
        typeof config.WEBHOOK_SECRET_ENCRYPTION_KEY === 'string'
          ? config.WEBHOOK_SECRET_ENCRYPTION_KEY.trim()
          : undefined,
      );
    } catch (error: unknown) {
      throw new Error(
        error instanceof Error ? error.message : 'Invalid encryption key',
      );
    }
  }
}
