import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  connect,
  type AmqpConnectionManager,
  type ChannelWrapper,
} from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { applyTopology, parcelEventsTopology } from '@swiftdrop/contracts';
import { MESSAGING_CONFIG, type MessagingConfig } from './messaging.config.js';
import { MessagingStatus, type MessagingState } from './messaging-status.js';

export interface PublishProperties {
  readonly messageId: string;
  readonly type: string;
  readonly occurredAt: Date;
}

/**
 * One AMQP connection + confirm channel for publishing. Reconnects on its own
 * and re-declares the topology after every reconnect. `publish` resolves only
 * once the broker has confirmed the message is stored.
 */
@Injectable()
export class RabbitMqPublisher extends MessagingStatus {
  private readonly logger = new Logger(RabbitMqPublisher.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
  ) {
    super();
  }

  start(): void {
    if (this.connection || !this.config.enabled || !this.config.url) {
      return;
    }
    const topology = parcelEventsTopology(this.config.exchange);

    this.connection = connect([this.config.url], {
      heartbeatIntervalInSeconds: 15,
      reconnectTimeInSeconds: 5,
      connectionOptions: {
        clientProperties: { connection_name: `api:${this.config.instanceId}` },
      },
    });
    // Never log the URL: it contains the password.
    this.connection.on('connect', () =>
      this.logger.log('Connected to RabbitMQ'),
    );
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(
        `Disconnected from RabbitMQ: ${err?.message ?? 'unknown reason'}`,
      ),
    );
    this.connection.on('connectFailed', ({ err }) =>
      this.logger.warn(
        `Could not connect to RabbitMQ: ${err?.message ?? 'unknown reason'}`,
      ),
    );

    this.channel = this.connection.createChannel({
      name: 'outbox-publisher',
      confirm: true,
      json: false,
      publishTimeout: this.config.publishTimeoutMs,
      setup: (channel: ConfirmChannel) => applyTopology(channel, topology),
    });
    this.channel.on('error', (err: Error) =>
      this.logger.error(`RabbitMQ channel error: ${err.message}`),
    );
  }

  /**
   * Another channel on the same connection, e.g. for the realtime fan-out
   * consumer. `setup` runs on every (re)connect. Null when messaging is off.
   */
  openChannel(
    name: string,
    setup: (channel: ConfirmChannel) => Promise<void>,
  ): ChannelWrapper | null {
    this.start();
    if (!this.connection) return null;
    return this.connection.createChannel({ name, json: false, setup });
  }

  state(): MessagingState {
    if (!this.config.enabled) return 'disabled';
    return this.connection?.isConnected() ? 'up' : 'down';
  }

  isConnected(): boolean {
    return this.state() === 'up';
  }

  async publish(
    routingKey: string,
    body: Buffer,
    properties: PublishProperties,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ publisher is not started');
    }
    await this.channel.publish(this.config.exchange, routingKey, body, {
      persistent: true,
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      messageId: properties.messageId,
      type: properties.type,
      timestamp: Math.floor(properties.occurredAt.getTime() / 1000),
      appId: 'swiftdrop-api',
    });
  }

  async close(): Promise<void> {
    const { channel, connection } = this;
    this.channel = undefined;
    this.connection = undefined;
    try {
      await channel?.close();
    } finally {
      await connection?.close();
    }
  }
}
