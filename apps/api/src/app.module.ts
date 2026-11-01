import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './modules/auth/guards/roles.guard.js';
import { CsrfGuard } from './modules/auth/guards/csrf.guard.js';
import { cookieParserMiddleware } from './modules/auth/utils/cookie.util.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // apps/api/.env (local overrides) first, then the shared repo-root .env
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    AuthModule,
    HealthModule,
    PrismaModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guards execute in declaration order:
    // 1. CsrfGuard validates origin on state-changing requests before any processing
    // 2. JwtAuthGuard authenticates JWT from cookie or Bearer header and populates request.user
    // 3. RolesGuard verifies user role against route @Roles metadata
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cookieParserMiddleware).forRoutes('*');
  }
}
