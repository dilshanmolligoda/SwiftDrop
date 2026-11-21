import { hostname } from 'node:os';
import type { ConfigService } from '@nestjs/config';
import { PARCEL_EVENTS_EXCHANGE } from '@swiftdrop/contracts';

export const MESSAGING_CONFIG = Symbol('MESSAGING_CONFIG');

export interface MessagingConfig {
  /** False when RABBITMQ_URL is missing (dev/test) or OUTBOX_RELAY_ENABLED=false. */
  readonly enabled: boolean;
  readonly url: string | undefined;
  readonly exchange: string;
  readonly pollIntervalMs: number;
  readonly batchSize: number;
  readonly publishTimeoutMs: number;
  /** Identifies this API process in logs (and later its realtime queue). */
  readonly instanceId: string;
}

export function loadMessagingConfig(config: ConfigService): MessagingConfig {
  const url = config.get<string>('RABBITMQ_URL')?.trim() || undefined;
  const relayEnabled = config.get<string>('OUTBOX_RELAY_ENABLED') !== 'false';
  return {
    enabled: relayEnabled && url !== undefined,
    url,
    exchange:
      config.get<string>('RABBITMQ_EVENTS_EXCHANGE')?.trim() ||
      PARCEL_EVENTS_EXCHANGE,
    pollIntervalMs: positiveInt(config, 'OUTBOX_POLL_INTERVAL_MS', 1000),
    batchSize: positiveInt(config, 'OUTBOX_BATCH_SIZE', 50),
    publishTimeoutMs: positiveInt(config, 'OUTBOX_PUBLISH_TIMEOUT_MS', 5000),
    instanceId: sanitizeInstanceId(
      config.get<string>('INSTANCE_ID') ?? `${hostname()}-${process.pid}`,
    ),
  };
}

function positiveInt(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string | number>(key);
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function sanitizeInstanceId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64) || 'api';
}
