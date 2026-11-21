import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import { MessagingModule } from './infrastructure/messaging/messaging.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { ApprovalGuard } from './modules/auth/guards/approval.guard.js';
import { RolesGuard } from './modules/auth/guards/roles.guard.js';
import { CsrfGuard } from './modules/auth/guards/csrf.guard.js';
import { cookieParserMiddleware } from './modules/auth/utils/cookie.util.js';
import { CourierModule } from './modules/courier/courier.module.js';
import { EmailModule } from './modules/email/email.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { MerchantDashboardModule } from './modules/merchant-dashboard/merchant-dashboard.module.js';
import { MerchantWebhooksModule } from './modules/merchant-webhooks/merchant-webhooks.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { ParcelsModule } from './modules/parcels/parcels.module.js';
import { TrackingModule } from './modules/tracking/tracking.module.js';
import { MerchantSettingsModule } from './modules/merchant-settings/merchant-settings.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // apps/api/.env (local overrides) first, then the shared repo-root .env
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    AuthModule,
    CourierModule,
    EmailModule,
    HealthModule,
    MerchantDashboardModule,
    MerchantSettingsModule,
    MerchantWebhooksModule,
    MessagingModule,
    ParcelsModule,
    PricingModule,
    PrismaModule,
    RealtimeModule,
    TrackingModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guards execute in declaration order:
    // 1. CsrfGuard validates origin on state-changing requests before any processing
    // 2. JwtAuthGuard authenticates JWT from cookie or Bearer header and populates request.user
    // 3. ApprovalGuard checks live database approval status for non-exempt routes
    // 4. RolesGuard verifies user role against route @Roles metadata
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ApprovalGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cookieParserMiddleware).forRoutes('*');
  }
}
