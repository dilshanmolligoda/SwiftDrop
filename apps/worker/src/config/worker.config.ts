import { hostname } from 'node:os';
import type { ConfigService } from '@nestjs/config';
import { PARCEL_EVENTS_EXCHANGE } from '@swiftdrop/contracts';

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
}

/** Defaults and upper bounds for the numeric settings. */
export const NUMERIC_SETTINGS = {
  RABBITMQ_PREFETCH: { fallback: 10, max: 500 },
  WORKER_RETRY_DELAY_MS: { fallback: 5000, max: 600_000 },
  WORKER_HEALTH_PORT: { fallback: 4010, max: 65_535 },
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
  };
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
