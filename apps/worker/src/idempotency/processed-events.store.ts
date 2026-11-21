import { Injectable } from '@nestjs/common';
import type { ConsumerName } from '@swiftdrop/contracts';
import { PrismaService } from '../infrastructure/prisma.service.js';

/**
 * Remembers which events each consumer has finished, so a redelivered message
 * (RabbitMQ is at-least-once) does nothing the second time.
 */
@Injectable()
export class ProcessedEventsStore {
  constructor(private readonly prisma: PrismaService) {}

  async isProcessed(eventId: string, consumer: ConsumerName): Promise<boolean> {
    const row = await this.prisma.processedEvent.findUnique({
      where: { eventId_consumer: { eventId, consumer } },
      select: { eventId: true },
    });
    return row !== null;
  }

  /** Idempotent: marking an event twice is not an error. */
  async markProcessed(eventId: string, consumer: ConsumerName): Promise<void> {
    await this.prisma.processedEvent.createMany({
      data: [{ eventId, consumer }],
      skipDuplicates: true,
    });
  }
}
