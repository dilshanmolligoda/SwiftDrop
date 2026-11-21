import { Injectable, Logger } from '@nestjs/common';
import {
  ConsumerName,
  Queue,
  statusAfter,
  type ParcelEventV1,
} from '@swiftdrop/contracts';
import type { ParcelEventConsumer } from '../messaging/parcel-event-consumer.js';

/**
 * Customer notifications (email via SMTP/Mailpit, mock SMS).
 * Phase 4 scaffold: logs the event. Sending arrives in Phase 6.
 */
@Injectable()
export class NotificationConsumer implements ParcelEventConsumer {
  readonly queue = Queue.NOTIFICATIONS;
  readonly name = ConsumerName.NOTIFICATIONS;
  private readonly logger = new Logger(NotificationConsumer.name);

  handle(event: ParcelEventV1): Promise<void> {
    this.logger.log(
      `${event.eventType} ${event.trackingNumber} → ${statusAfter(event)} (notification sending not implemented yet)`,
    );
    return Promise.resolve();
  }
}
