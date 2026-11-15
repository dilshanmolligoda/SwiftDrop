import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { MerchantDashboardController } from './merchant-dashboard.controller.js';
import { MerchantDashboardRepository } from './merchant-dashboard.repository.js';
import { MerchantDashboardService } from './merchant-dashboard.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [MerchantDashboardController],
  providers: [MerchantDashboardRepository, MerchantDashboardService],
})
export class MerchantDashboardModule {}
