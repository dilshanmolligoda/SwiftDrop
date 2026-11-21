import { validateEnv } from './env.validation.js';
import { parseStatusList } from './worker.config.js';

describe('validateEnv (worker)', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    RABBITMQ_URL: 'amqp://swiftdrop:secret@localhost:5672',
  };

  it('accepts the required settings', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it.each(['DATABASE_URL', 'RABBITMQ_URL'])('requires %s', (key) => {
    expect(() => validateEnv({ ...base, [key]: '' })).toThrow(
      new RegExp(`Missing required environment variables: ${key}`),
    );
  });

  it('rejects a non-AMQP URL', () => {
    expect(() =>
      validateEnv({ ...base, RABBITMQ_URL: 'http://localhost:5672' }),
    ).toThrow(/amqp:\/\//);
  });

  it('allows the example password locally but not in production', () => {
    const placeholder = 'amqp://swiftdrop:<change-me>@rabbitmq:5672';
    expect(() =>
      validateEnv({ ...base, RABBITMQ_URL: placeholder }),
    ).not.toThrow();
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        RABBITMQ_URL: placeholder,
      }),
    ).toThrow(/placeholder/);
  });

  it.each([
    ['RABBITMQ_PREFETCH', '0'],
    ['RABBITMQ_PREFETCH', '501'],
    ['WORKER_RETRY_DELAY_MS', '2.5'],
    ['WORKER_HEALTH_PORT', '70000'],
  ])('rejects %s=%s', (key, value) => {
    expect(() => validateEnv({ ...base, [key]: value })).toThrow(
      new RegExp(key),
    );
  });
});

describe('validateEnv (worker webhooks)', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    RABBITMQ_URL: 'amqp://swiftdrop:secret@localhost:5672',
  };
  const key = Buffer.alloc(32, 1).toString('base64');

  it('lets development start without an encryption key', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('requires a valid 32-byte key in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /WEBHOOK_SECRET_ENCRYPTION_KEY/,
    );
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        WEBHOOK_SECRET_ENCRYPTION_KEY: '<change-me-32-bytes-base64>',
      }),
    ).toThrow(/32 bytes/);
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        WEBHOOK_SECRET_ENCRYPTION_KEY: key,
        SMTP_HOST: 'smtp.example.com',
      }),
    ).not.toThrow();
  });

  it('refuses the private-target switch in production', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        WEBHOOK_SECRET_ENCRYPTION_KEY: key,
        WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true',
      }),
    ).toThrow(/not allowed in production/);
  });

  it.each([
    ['WEBHOOK_MAX_ATTEMPTS', '21'],
    ['WEBHOOK_TIMEOUT_MS', '0'],
    ['WEBHOOK_ALLOW_PRIVATE_TARGETS', 'yes'],
  ])('rejects %s=%s', (name, value) => {
    expect(() => validateEnv({ ...base, [name]: value })).toThrow(
      new RegExp(name),
    );
  });
});

describe('validateEnv (worker notifications)', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    RABBITMQ_URL: 'amqp://swiftdrop:secret@localhost:5672',
  };

  it.each([
    ['SMS_PROVIDER', 'twilio'],
    ['NOTIFY_EMAIL_ENABLED', 'yes'],
    ['NOTIFY_STATUSES', 'DELIVERED,LOST'],
    ['SMTP_PORT', '0'],
  ])('rejects %s=%s', (name, value) => {
    expect(() => validateEnv({ ...base, [name]: value })).toThrow(
      new RegExp(name),
    );
  });

  it('requires SMTP_HOST in production unless email is off', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    };
    expect(() => validateEnv(production)).toThrow(/SMTP_HOST/);
    expect(() =>
      validateEnv({ ...production, NOTIFY_EMAIL_ENABLED: 'false' }),
    ).not.toThrow();
    expect(() =>
      validateEnv({ ...production, SMTP_HOST: 'smtp.example.com' }),
    ).not.toThrow();
  });
});

describe('parseStatusList', () => {
  it('uses the defaults when empty and normalises case', () => {
    expect([...parseStatusList(undefined)]).toEqual([
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'FAILED',
      'RETURNED',
    ]);
    expect([...parseStatusList(' delivered , failed ')]).toEqual([
      'DELIVERED',
      'FAILED',
    ]);
  });
});
