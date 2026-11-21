import { validateEnv } from './env.validation.js';

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
