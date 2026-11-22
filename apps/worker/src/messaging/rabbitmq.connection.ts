import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  connect,
  type AmqpConnectionManager,
  type ChannelWrapper,
} from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import {
  applyTopology,
  parcelEventsTopology,
  type QueueDeclaration,
} from '@swiftdrop/contracts';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker.config.js';

/**
 * The worker's single AMQP connection. Reconnects on its own; each channel
 * re-declares the shared topology on every (re)connect, so the worker works
 * even if it starts before the API ever has.
 */
@Injectable()
export class RabbitMqConnection implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConnection.name);
  private connection?: AmqpConnectionManager;

  constructor(@Inject(WORKER_CONFIG) private readonly config: WorkerConfig) {}

  /**
   * @param extraQueues declared after the shared topology, before the channel
   *   is used — on every (re)connect.
   */
  createChannel(
    name: string,
    extraQueues: readonly QueueDeclaration[] = [],
  ): ChannelWrapper {
    const shared = parcelEventsTopology(this.config.exchange);
    const topology = {
      exchanges: shared.exchanges,
      queues: [...shared.queues, ...extraQueues],
    };
    return this.connect().createChannel({
      name,
      confirm: true,
      json: false,
      setup: (channel: ConfirmChannel) => applyTopology(channel, topology),
    });
  }

  isConnected(): boolean {
    return this.connection?.isConnected() ?? false;
  }

  async onModuleDestroy(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    await connection?.close();
  }

  private connect(): AmqpConnectionManager {
    if (this.connection) return this.connection;

    const connection = connect([this.config.rabbitmqUrl], {
      heartbeatIntervalInSeconds: 15,
      reconnectTimeInSeconds: 5,
      connectionOptions: {
        clientProperties: {
          connection_name: `worker:${this.config.instanceId}`,
        },
      },
    });
    // Never log the URL: it contains the password.
    connection.on('connect', () => this.logger.log('Connected to RabbitMQ'));
    connection.on('disconnect', ({ err }) =>
      this.logger.warn(
        `Disconnected from RabbitMQ: ${err?.message ?? 'unknown reason'}`,
      ),
    );
    connection.on('connectFailed', ({ err }) =>
      this.logger.warn(
        `Could not connect to RabbitMQ: ${err?.message ?? 'unknown reason'}`,
      ),
    );
    this.connection = connection;
    return connection;
  }
}
