import { Module } from '@nestjs/common';
import { MerchantApiKeysController } from './controllers/merchant-api-keys.controller.js';
import { MerchantApiController } from './controllers/merchant-api.controller.js';
import { MerchantWebhookController } from './controllers/merchant-webhook.controller.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { ApiKeysRepository } from './repositories/api-keys.repository.js';
import { MerchantProfilesRepository } from './repositories/merchant-profiles.repository.js';
import { WebhooksRepository } from './repositories/webhooks.repository.js';
import { ApiKeysService } from './services/api-keys.service.js';
import { WebhookDeliveryService } from './services/webhook-delivery.service.js';
import { WebhookEndpointsService } from './services/webhook-endpoints.service.js';
import { WebhookHttpClient } from './services/webhook-http.client.js';
import { WebhookSettings } from './services/webhook-settings.js';

@Module({
  controllers: [
    MerchantApiKeysController,
    MerchantApiController,
    MerchantWebhookController,
  ],
  providers: [
    ApiKeysRepository,
    ApiKeysService,
    ApiKeyGuard,
    MerchantProfilesRepository,
    WebhooksRepository,
    WebhookSettings,
    WebhookHttpClient,
    WebhookDeliveryService,
    WebhookEndpointsService,
  ],
  exports: [ApiKeysService, ApiKeyGuard, WebhookEndpointsService],
})
export class MerchantIntegrationModule {}
