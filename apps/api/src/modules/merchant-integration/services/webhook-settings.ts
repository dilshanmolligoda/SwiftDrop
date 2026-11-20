import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseEncryptionKey } from '../domain/webhook-secret.js';
import type { WebhookRetryConfig } from '../domain/webhook-retry-policy.js';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_BACKOFF_BASE_MS = 30000;

/** Webhook settings from the environment (WEBHOOK_* variables in .env.example). */
@Injectable()
export class WebhookSettings {
  private readonly logger = new Logger(WebhookSettings.name);

  constructor(private readonly configService: ConfigService) {}

  get timeoutMs(): number {
    return this.positiveInt('WEBHOOK_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  }

  get retry(): WebhookRetryConfig {
    return {
      maxAttempts: this.positiveInt(
        'WEBHOOK_MAX_ATTEMPTS',
        DEFAULT_MAX_ATTEMPTS,
      ),
      backoffBaseMs: this.positiveInt(
        'WEBHOOK_BACKOFF_BASE_MS',
        DEFAULT_BACKOFF_BASE_MS,
      ),
    };
  }

  /** Outside production, http:// and localhost URLs are allowed for the mock merchant store. */
  get allowLocalUrls(): boolean {
    return this.configService.get<string>('NODE_ENV') !== 'production';
  }

  /** Read on use, so the rest of the API still runs where webhooks are not configured. */
  encryptionKey(): Buffer {
    try {
      return parseEncryptionKey(
        this.configService.get<string>('WEBHOOK_SECRET_ENCRYPTION_KEY'),
      );
    } catch {
      this.logger.error('WEBHOOK_SECRET_ENCRYPTION_KEY is missing or invalid');
      throw new ServiceUnavailableException(
        'Merchant webhooks are not configured on this server',
      );
    }
  }

  private positiveInt(key: string, fallback: number): number {
    const value = Number(this.configService.get<string | number>(key));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
