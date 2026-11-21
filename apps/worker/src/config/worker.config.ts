import { hostname } from 'node:os';
import type { ConfigService } from '@nestjs/config';
import {
  isParcelStatus,
  PARCEL_EVENTS_EXCHANGE,
  type ParcelStatus,
} from '@swiftdrop/contracts';
import { parseEncryptionKey } from '@swiftdrop/contracts/node';

export const WORKER_CONFIG = Symbol('WORKER_CONFIG');

export interface WorkerConfig {
  readonly rabbitmqUrl: string;
  readonly exchange: string;
  /** Unacknowledged messages each consumer may hold at once. */
  readonly prefetch: number;
  /** Wait before a failed message is put back on its queue. */
  readonly retryDelayMs: number;
  readonly healthPort: number;
  readonly instanceId: string;
  readonly webhooks: WebhookConfig;
  readonly notifications: NotificationsConfig;
}

export interface NotificationsConfig {
  readonly email: {
    readonly enabled: boolean;
    readonly host: string;
    readonly port: number;
    readonly user: string | undefined;
    readonly password: string | undefined;
    readonly from: string;
  };
  /** 'mock' logs + records; 'none' skips SMS. */
  readonly smsProvider: 'mock' | 'none';
  /** Base URL of the web app, used in email links. */
  readonly webAppUrl: string;
  /** Status changes customers are told about. */
  readonly notifyStatuses: ReadonlySet<ParcelStatus>;
}

export const DEFAULT_NOTIFY_STATUSES: readonly ParcelStatus[] = [
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RETURNED',
];

export interface WebhookConfig {
  readonly timeoutMs: number;
  /** Total delivery attempts including the first (WEBHOOK_MAX_ATTEMPTS). */
  readonly maxAttempts: number;
  /** Delay before the first retry; ×4 each time (WEBHOOK_BACKOFF_BASE_MS). */
  readonly backoffBaseMs: number;
  /** Production: only https URLs (allowlisted private hosts excepted). */
  readonly requireHttps: boolean;
  /** Dev only: allow any private / loopback address. */
  readonly allowPrivateTargets: boolean;
  /** Hostnames allowed even though they resolve privately, e.g. mock-merchant. */
  readonly privateHostAllowlist: ReadonlySet<string>;
  /** Null when WEBHOOK_SECRET_ENCRYPTION_KEY is missing/invalid (dev only). */
  readonly encryptionKey: Buffer | null;
}

/** Defaults and upper bounds for the numeric settings. */
export const NUMERIC_SETTINGS = {
  RABBITMQ_PREFETCH: { fallback: 10, max: 500 },
  WORKER_RETRY_DELAY_MS: { fallback: 5000, max: 600_000 },
  WORKER_HEALTH_PORT: { fallback: 4010, max: 65_535 },
  WEBHOOK_TIMEOUT_MS: { fallback: 5000, max: 60_000 },
  WEBHOOK_MAX_ATTEMPTS: { fallback: 6, max: 20 },
  WEBHOOK_BACKOFF_BASE_MS: { fallback: 30_000, max: 3_600_000 },
  SMTP_PORT: { fallback: 1025, max: 65_535 },
} as const;

export function loadWorkerConfig(config: ConfigService): WorkerConfig {
  return {
    rabbitmqUrl: config.getOrThrow<string>('RABBITMQ_URL').trim(),
    exchange:
      config.get<string>('RABBITMQ_EVENTS_EXCHANGE')?.trim() ||
      PARCEL_EVENTS_EXCHANGE,
    prefetch: numeric(config, 'RABBITMQ_PREFETCH'),
    retryDelayMs: numeric(config, 'WORKER_RETRY_DELAY_MS'),
    healthPort: numeric(config, 'WORKER_HEALTH_PORT'),
    instanceId: (
      config.get<string>('INSTANCE_ID') ?? `${hostname()}-${process.pid}`
    )
      .replace(/[^A-Za-z0-9_-]/g, '-')
      .slice(0, 64),
    webhooks: {
      timeoutMs: numeric(config, 'WEBHOOK_TIMEOUT_MS'),
      maxAttempts: numeric(config, 'WEBHOOK_MAX_ATTEMPTS'),
      backoffBaseMs: numeric(config, 'WEBHOOK_BACKOFF_BASE_MS'),
      requireHttps: config.get<string>('NODE_ENV') === 'production',
      allowPrivateTargets:
        config.get<string>('WEBHOOK_ALLOW_PRIVATE_TARGETS') === 'true',
      privateHostAllowlist: parseHostList(
        config.get<string>('WEBHOOK_PRIVATE_HOST_ALLOWLIST'),
      ),
      encryptionKey: tryParseKey(
        config.get<string>('WEBHOOK_SECRET_ENCRYPTION_KEY'),
      ),
    },
    notifications: {
      email: {
        enabled: config.get<string>('NOTIFY_EMAIL_ENABLED') !== 'false',
        host: config.get<string>('SMTP_HOST')?.trim() || 'localhost',
        port: numeric(config, 'SMTP_PORT'),
        user: config.get<string>('SMTP_USER')?.trim() || undefined,
        password: config.get<string>('SMTP_PASSWORD') || undefined,
        from:
          config.get<string>('SMTP_FROM')?.trim() ||
          'SwiftDrop <no-reply@swiftdrop.local>',
      },
      smsProvider:
        config.get<string>('SMS_PROVIDER')?.trim() === 'none' ? 'none' : 'mock',
      webAppUrl:
        config.get<string>('WEB_APP_URL')?.trim() || 'http://localhost:5173',
      notifyStatuses: parseStatusList(config.get<string>('NOTIFY_STATUSES')),
    },
  };
}

/** Comma-separated ParcelStatus values; empty → the defaults. */
export function parseStatusList(
  raw: string | undefined,
): ReadonlySet<ParcelStatus> {
  const values = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return new Set(
    values.length > 0 ? values.filter(isParcelStatus) : DEFAULT_NOTIFY_STATUSES,
  );
}

export function parseHostList(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function tryParseKey(raw: string | undefined): Buffer | null {
  try {
    return parseEncryptionKey(raw?.trim());
  } catch {
    return null;
  }
}

function numeric(
  config: ConfigService,
  key: keyof typeof NUMERIC_SETTINGS,
): number {
  const raw = config.get<string | number>(key);
  return raw === undefined || raw === ''
    ? NUMERIC_SETTINGS[key].fallback
    : Number(raw);
}
