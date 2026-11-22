import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { MerchantSettingsController } from './merchant-settings.controller.js';
import { MerchantSettingsService } from './merchant-settings.service.js';

@Module({
  imports: [PrismaModule, AuthModule, EmailModule],
  controllers: [MerchantSettingsController],
  providers: [MerchantSettingsService],
  exports: [MerchantSettingsService],
})
export class MerchantSettingsModule {}
