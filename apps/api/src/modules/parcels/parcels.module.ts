import { Module } from '@nestjs/common';
import { ParcelsController } from './parcels.controller.js';
import { ParcelsService } from './parcels.service.js';
import { ParcelsRepository } from './parcels.repository.js';
import { OutboxModule } from '../../infrastructure/outbox/outbox.module.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { PricingModule } from '../pricing/pricing.module.js';

@Module({
  imports: [OutboxModule, PrismaModule, PricingModule],
  controllers: [ParcelsController],
  providers: [ParcelsService, ParcelsRepository],
  exports: [ParcelsService],
})
export class ParcelsModule {}
