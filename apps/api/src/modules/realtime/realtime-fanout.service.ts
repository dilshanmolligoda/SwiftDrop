import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  parseParcelEvent,
  realtimeQueue,
  RoutingKey,
  toPublicRealtimeParcelUpdate,
  toRealtimeParcelUpdate,
} from '@swiftdrop/contracts';
import {
  MESSAGING_CONFIG,
  type MessagingConfig,
} from '../../infrastructure/messaging/messaging.config.js';
import { RabbitMqPublisher } from '../../infrastructure/messaging/rabbitmq.publisher.js';
import { RealtimeGateway } from './realtime.gateway.js';

/**
 * Feeds this API instance's WebSocket clients from RabbitMQ.
 *
 * Each instance has its own exclusive, auto-delete queue `realtime.{instanceId}`
 * bound to every parcel event, so with any number of API replicas each one
 * gets every event and emits it to the sockets it holds — no Redis adapter,
 * no sticky sessions. Live updates are best effort (no acks): a client that
 * misses one re-reads the state over REST when it reconnects.
 */
@Injectable()
export class RealtimeFanoutService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeFanoutService.name);
  private channel: ChannelWrapper | null = null;

  constructor(
    private readonly publisher: RabbitMqPublisher,
    private readonly gateway: RealtimeGateway,
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      this.logger.warn('RabbitMQ is not configured: live updates are off.');
      return;
    }
    const queue = realtimeQueue(this.config.instanceId);
    this.channel = this.publisher.openChannel(
      'realtime-fanout',
      async (channel: ConfirmChannel) => {
        await channel.assertQueue(queue, {
          exclusive: true,
          autoDelete: true,
          durable: false,
          // Don't pile up updates nobody will see if this instance stalls.
          arguments: { 'x-message-ttl': 60_000, 'x-max-length': 10_000 },
        });
        await channel.bindQueue(
          queue,
          this.config.exchange,
          RoutingKey.ALL_PARCEL_EVENTS,
        );
        await channel.consume(queue, (msg) => this.onMessage(msg), {
          noAck: true,
        });
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
  }

  /** Public for tests. */
  onMessage(msg: ConsumeMessage | null): void {
    if (!msg) return;
    const parsed = parseParcelEvent(msg.content);
    if (!parsed.ok) {
      this.logger.warn(`Ignoring invalid realtime event: ${parsed.error}`);
      return;
    }
    const event = parsed.value;
    this.gateway.broadcast(
      toRealtimeParcelUpdate(event),
      toPublicRealtimeParcelUpdate(event),
      { merchantId: event.merchantId, courierId: event.courierId },
    );
  }
}
