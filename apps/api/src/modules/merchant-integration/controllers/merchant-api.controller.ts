import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { CurrentMerchant } from '../decorators/current-merchant.decorator.js';
import { ApiKeyGuard } from '../guards/api-key.guard.js';
import type { ApiKeyPrincipal } from '../services/api-keys.service.js';

/**
 * Server-to-server API for merchant systems, authenticated with X-API-Key
 * instead of the browser session. Order endpoints will be added here once the
 * parcels service exists.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('merchant-api')
export class MerchantApiController {
  /** Lets a merchant confirm their key works before sending orders. */
  @Get('me')
  whoAmI(@CurrentMerchant() merchant: ApiKeyPrincipal) {
    return {
      merchantId: merchant.merchantProfileId,
      businessName: merchant.businessName,
      apiKeyPrefix: merchant.keyPrefix,
    };
  }
}
