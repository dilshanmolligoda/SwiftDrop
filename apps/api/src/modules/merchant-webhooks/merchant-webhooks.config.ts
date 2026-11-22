import type { ConfigService } from '@nestjs/config';
import { parseEncryptionKey } from '../merchant-integration/domain/webhook-secret.js';

export const MERCHANT_WEBHOOKS_CONFIG = Symbol('MERCHANT_WEBHOOKS_CONFIG');

/**
 * Same settings the worker uses (apps/worker/src/config/worker.config.ts), so a
 * URL accepted here is one the worker is allowed to call.
 */
export interface MerchantWebhooksConfig {
  /** Null when WEBHOOK_SECRET_ENCRYPTION_KEY is missing/invalid (dev only). */
  readonly encryptionKey: Buffer | null;
  /** Production: https only (allowlisted hosts excepted). */
  readonly requireHttps: boolean;
  /** Dev only: accept URLs on private networks. */
  readonly allowPrivateTargets: boolean;
  /** Hosts accepted although private, e.g. mock-merchant. */
  readonly privateHostAllowlist: ReadonlySet<string>;
}

export function loadMerchantWebhooksConfig(
  config: ConfigService,
): MerchantWebhooksConfig {
  let encryptionKey: Buffer | null = null;
  try {
    encryptionKey = parseEncryptionKey(
      config.get<string>('WEBHOOK_SECRET_ENCRYPTION_KEY')?.trim(),
    );
  } catch {
    encryptionKey = null;
  }
  return {
    encryptionKey,
    requireHttps: config.get<string>('NODE_ENV') === 'production',
    allowPrivateTargets:
      config.get<string>('WEBHOOK_ALLOW_PRIVATE_TARGETS') === 'true',
    privateHostAllowlist: new Set(
      (config.get<string>('WEBHOOK_PRIVATE_HOST_ALLOWLIST') ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    ),
  };
}
