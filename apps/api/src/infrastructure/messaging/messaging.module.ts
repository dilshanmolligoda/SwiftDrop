import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadMessagingConfig, MESSAGING_CONFIG } from './messaging.config.js';
import { MessagingStatus } from './messaging-status.js';
import { OutboxRelay } from './outbox-relay.service.js';
import { RabbitMqPublisher } from './rabbitmq.publisher.js';

/**
 * RabbitMQ connection, topology and the outbox relay. Imported once, by
 * AppModule. Feature modules don't import this — they use OutboxModule.
 */
@Global()
@Module({
  providers: [
    {
      provide: MESSAGING_CONFIG,
      inject: [ConfigService],
      useFactory: loadMessagingConfig,
    },
    RabbitMqPublisher,
    { provide: MessagingStatus, useExisting: RabbitMqPublisher },
    OutboxRelay,
  ],
  exports: [MessagingStatus],
})
export class MessagingModule {}
