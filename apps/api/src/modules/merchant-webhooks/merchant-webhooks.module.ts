import { Logger, Module, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import {
  loadMerchantWebhooksConfig,
  MERCHANT_WEBHOOKS_CONFIG,
  type MerchantWebhooksConfig,
} from './merchant-webhooks.config.js';
import { MerchantWebhooksController } from './merchant-webhooks.controller.js';
import { MerchantWebhooksRepository } from './merchant-webhooks.repository.js';
import { MerchantWebhooksService } from './merchant-webhooks.service.js';
import {
  dnsHostResolver,
  HOST_RESOLVER,
  WebhookTargetPolicy,
} from './webhook-target.policy.js';

/** Merchant webhook settings + delivery log. Delivery itself is apps/worker. */
@Module({
  imports: [PrismaModule],
  controllers: [MerchantWebhooksController],
  providers: [
    {
      provide: MERCHANT_WEBHOOKS_CONFIG,
      inject: [ConfigService],
      useFactory: loadMerchantWebhooksConfig,
    },
    { provide: HOST_RESOLVER, useValue: dnsHostResolver },
    WebhookTargetPolicy,
    MerchantWebhooksRepository,
    MerchantWebhooksService,
  ],
})
export class MerchantWebhooksModule implements OnModuleInit {
  constructor(
    @Inject(MERCHANT_WEBHOOKS_CONFIG)
    private readonly config: MerchantWebhooksConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.encryptionKey) {
      new Logger(MerchantWebhooksModule.name).warn(
        'WEBHOOK_SECRET_ENCRYPTION_KEY is missing or not 32 bytes: merchants ' +
          'cannot set up webhooks until it is configured.',
      );
    }
  }
}
