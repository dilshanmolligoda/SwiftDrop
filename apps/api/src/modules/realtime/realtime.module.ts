import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { ParcelAccessService } from './parcel-access.service.js';
import { RealtimeAuthService } from './realtime-auth.service.js';
import { RealtimeFanoutService } from './realtime-fanout.service.js';
import { RealtimeGateway } from './realtime.gateway.js';

/**
 * Live parcel updates over Socket.IO (ADR 0002). Needs MessagingModule
 * (global) for the RabbitMQ fan-out, and RealtimeIoAdapter set in main.ts.
 */
@Module({
  imports: [AuthModule, PrismaModule, UsersModule],
  providers: [
    RealtimeAuthService,
    ParcelAccessService,
    RealtimeGateway,
    RealtimeFanoutService,
  ],
})
export class RealtimeModule {}
