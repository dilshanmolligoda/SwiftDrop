import {
  DEFAULT_NOTIFY_STATUSES,
  type NotificationsConfig,
  type WebhookConfig,
  type WorkerConfig,
} from '../config/worker.config.js';

/** A complete WorkerConfig for unit tests; override only what a test needs. */
export function testWorkerConfig(
  overrides: {
    webhooks?: Partial<WebhookConfig>;
    notifications?: Partial<NotificationsConfig>;
  } = {},
): WorkerConfig {
  return {
    rabbitmqUrl: 'amqp://test',
    exchange: 'parcel.events',
    prefetch: 10,
    retryDelayMs: 5000,
    healthPort: 4010,
    instanceId: 'test',
    webhooks: {
      timeoutMs: 5000,
      maxAttempts: 6,
      backoffBaseMs: 30_000,
      requireHttps: false,
      allowPrivateTargets: false,
      privateHostAllowlist: new Set(),
      encryptionKey: null,
      ...overrides.webhooks,
    },
    notifications: {
      email: {
        enabled: true,
        host: 'localhost',
        port: 1025,
        user: undefined,
        password: undefined,
        from: 'SwiftDrop <no-reply@swiftdrop.local>',
      },
      smsProvider: 'mock',
      webAppUrl: 'http://localhost:5173',
      notifyStatuses: new Set(DEFAULT_NOTIFY_STATUSES),
      ...overrides.notifications,
    },
  };
}
