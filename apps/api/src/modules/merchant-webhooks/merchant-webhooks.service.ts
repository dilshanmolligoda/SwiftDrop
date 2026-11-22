import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { WebhookDeliveryStatus } from '../../generated/prisma/enums.js';
import {
  encryptWebhookSecret,
  generateWebhookSecret,
} from '../merchant-integration/domain/webhook-secret.js';
import {
  MERCHANT_WEBHOOKS_CONFIG,
  type MerchantWebhooksConfig,
} from './merchant-webhooks.config.js';
import {
  MerchantWebhooksRepository,
  type WebhookDeliveryRecord,
  type WebhookEndpointRecord,
} from './merchant-webhooks.repository.js';
import { WebhookTargetPolicy } from './webhook-target.policy.js';

export interface WebhookSettings {
  configured: boolean;
  url: string | null;
  isActive: boolean;
  /** Last characters of the signing secret, e.g. "…a1B2". */
  secretHint: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WebhookSettingsWithSecret extends WebhookSettings {
  /**
   * Only present when a secret was just created or rotated. It is never shown
   * again — the merchant must store it now to verify signatures.
   */
  signingSecret?: string;
}

export interface WebhookDeliveriesPage {
  items: Array<
    Omit<WebhookDeliveryRecord, 'nextAttemptAt' | 'createdAt'> & {
      nextAttemptAt: string | null;
      createdAt: string;
    }
  >;
  page: number;
  pageSize: number;
  total: number;
}

const HINT_LENGTH = 4;

@Injectable()
export class MerchantWebhooksService {
  constructor(
    private readonly repository: MerchantWebhooksRepository,
    private readonly targets: WebhookTargetPolicy,
    @Inject(MERCHANT_WEBHOOKS_CONFIG)
    private readonly config: MerchantWebhooksConfig,
  ) {}

  async getSettings(merchantUserId: string): Promise<WebhookSettings> {
    return toSettings(await this.repository.findEndpoint(merchantUserId));
  }

  /**
   * Creates the webhook (new secret, returned once) or changes its URL and
   * re-activates it (secret unchanged). Saving always re-validates the URL.
   */
  async saveUrl(
    merchantUserId: string,
    rawUrl: string,
  ): Promise<WebhookSettingsWithSecret> {
    const target = await this.targets.check(rawUrl);
    if (!target.ok) {
      throw new BadRequestException(target.error);
    }

    const existing = await this.repository.findEndpoint(merchantUserId);
    if (existing) {
      return toSettings(
        await this.repository.updateEndpoint(merchantUserId, {
          url: target.url,
          isActive: true,
        }),
      );
    }

    const secret = generateWebhookSecret();
    const created = await this.repository.createEndpoint({
      merchantUserId,
      url: target.url,
      ...this.encrypt(secret, merchantUserId),
    });
    return { ...toSettings(created), signingSecret: secret };
  }

  /** Replaces the signing secret; the old one stops working immediately. */
  async rotateSecret(
    merchantUserId: string,
  ): Promise<WebhookSettingsWithSecret> {
    await this.requireEndpoint(merchantUserId);
    const secret = generateWebhookSecret();
    const updated = await this.repository.updateEndpoint(
      merchantUserId,
      this.encrypt(secret, merchantUserId),
    );
    return { ...toSettings(updated), signingSecret: secret };
  }

  /** Stops deliveries. History and secret are kept; saving a URL re-enables. */
  async disable(merchantUserId: string): Promise<WebhookSettings> {
    await this.requireEndpoint(merchantUserId);
    return toSettings(
      await this.repository.updateEndpoint(merchantUserId, {
        isActive: false,
      }),
    );
  }

  async listDeliveries(
    merchantUserId: string,
    query: { page?: number; pageSize?: number; status?: WebhookDeliveryStatus },
  ): Promise<WebhookDeliveriesPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { items, total } = await this.repository.listDeliveries(
      merchantUserId,
      { page, pageSize, status: query.status },
    );
    return {
      items: items.map((item) => ({
        ...item,
        nextAttemptAt: item.nextAttemptAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }

  private async requireEndpoint(merchantUserId: string): Promise<void> {
    if (!(await this.repository.findEndpoint(merchantUserId))) {
      throw new NotFoundException('No webhook is configured');
    }
  }

  /** Encrypted with the merchant's ID as context, as the worker expects. */
  private encrypt(secret: string, merchantUserId: string) {
    if (!this.config.encryptionKey) {
      throw new ServiceUnavailableException(
        'Webhooks are not available: the server has no encryption key configured',
      );
    }
    return {
      secretEncrypted: encryptWebhookSecret(
        secret,
        this.config.encryptionKey,
        merchantUserId,
      ),
      secretHint: secret.slice(-HINT_LENGTH),
    };
  }
}

function toSettings(endpoint: WebhookEndpointRecord | null): WebhookSettings {
  if (!endpoint) {
    return {
      configured: false,
      url: null,
      isActive: false,
      secretHint: null,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    configured: true,
    url: endpoint.url,
    isActive: endpoint.isActive,
    secretHint: `…${endpoint.secretHint}`,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}
