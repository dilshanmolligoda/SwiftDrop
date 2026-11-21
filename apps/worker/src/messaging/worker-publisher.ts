import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { ChannelWrapper } from 'amqp-connection-manager';
import {
  getRetryDelayMs,
  webhookRetryQueueDeclaration,
} from '@swiftdrop/contracts';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker.config.js';
import { RabbitMqConnection } from './rabbitmq.connection.js';

export interface SendOptions {
  readonly messageId?: string;
  readonly type?: string;
  readonly headers?: Record<string, unknown>;
}

/**
 * Lets consumers put messages on a queue (webhook retries, dead-letter copies).
 * Resolves only after the broker confirms the message is stored.
 */
@Injectable()
export class WorkerPublisher
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private channel?: ChannelWrapper;

  constructor(
    private readonly connection: RabbitMqConnection,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  /** Delays used between webhook attempts, one delay queue each. */
  webhookRetryDelays(): number[] {
    const { maxAttempts, backoffBaseMs } = this.config.webhooks;
    const delays = new Set<number>();
    for (let failed = 1; failed < maxAttempts; failed++) {
      const delay = getRetryDelayMs(failed, { maxAttempts, backoffBaseMs });
      if (delay !== null) delays.add(delay);
    }
    return [...delays];
  }

  /** Created at startup so the retry queues exist before any retry is sent. */
  onApplicationBootstrap(): void {
    this.getChannel();
  }

  async sendToQueue(
    queue: string,
    content: Buffer,
    options: SendOptions = {},
  ): Promise<void> {
    await this.getChannel().sendToQueue(queue, content, {
      persistent: true,
      contentType: 'application/json',
      appId: 'swiftdrop-worker',
      ...options,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
  }

  private getChannel(): ChannelWrapper {
    if (!this.channel) {
      // Declared in the channel's own setup, which always runs before
      // anything is sent — a retry can never go to a missing queue.
      this.channel = this.connection.createChannel(
        'publisher',
        this.webhookRetryDelays().map(webhookRetryQueueDeclaration),
      );
    }
    return this.channel;
  }
}
