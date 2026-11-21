import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { loadWorkerConfig, WORKER_CONFIG } from './config/worker.config.js';
import { NotificationConsumer } from './consumers/notification.consumer.js';
import { WebhookConsumer } from './consumers/webhook.consumer.js';
import { HealthServer } from './health/health.server.js';
import { ProcessedEventsStore } from './idempotency/processed-events.store.js';
import { PrismaService } from './infrastructure/prisma.service.js';
import { ConsumerRunner } from './messaging/consumer-runner.js';
import {
  PARCEL_EVENT_CONSUMERS,
  type ParcelEventConsumer,
} from './messaging/parcel-event-consumer.js';
import { RabbitMqConnection } from './messaging/rabbitmq.connection.js';
import { WorkerPublisher } from './messaging/worker-publisher.js';
import { WebhookDeliveryRepository } from './webhooks/webhook-delivery.repository.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // apps/worker/.env (local overrides, e.g. @localhost hosts) first, then the repo-root .env
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
  ],
  providers: [
    {
      provide: WORKER_CONFIG,
      inject: [ConfigService],
      useFactory: loadWorkerConfig,
    },
    PrismaService,
    RabbitMqConnection,
    ProcessedEventsStore,
    WorkerPublisher,
    WebhookDeliveryRepository,
    NotificationConsumer,
    WebhookConsumer,
    {
      // Add new consumers here.
      provide: PARCEL_EVENT_CONSUMERS,
      inject: [NotificationConsumer, WebhookConsumer],
      useFactory: (...consumers: ParcelEventConsumer[]) => consumers,
    },
    ConsumerRunner,
    HealthServer,
  ],
})
export class WorkerModule {}
