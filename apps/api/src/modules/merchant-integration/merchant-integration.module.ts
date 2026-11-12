import { Module } from '@nestjs/common';
import { MerchantApiKeysController } from './controllers/merchant-api-keys.controller.js';
import { MerchantApiController } from './controllers/merchant-api.controller.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { ApiKeysRepository } from './repositories/api-keys.repository.js';
import { ApiKeysService } from './services/api-keys.service.js';

@Module({
  controllers: [MerchantApiKeysController, MerchantApiController],
  providers: [ApiKeysRepository, ApiKeysService, ApiKeyGuard],
  exports: [ApiKeysService, ApiKeyGuard],
})
export class MerchantIntegrationModule {}
