import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';
import { MerchantPricingController } from './merchant-pricing.controller.js';
import { MerchantPricingRepository } from './merchant-pricing.repository.js';
import { MerchantPricingService } from './merchant-pricing.service.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [PricingController, MerchantPricingController],
  providers: [
    PricingService,
    MerchantPricingRepository,
    MerchantPricingService,
  ],
  exports: [PricingService],
})
export class PricingModule {}
