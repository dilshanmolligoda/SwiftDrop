import { Injectable, Logger } from '@nestjs/common';
import {
  ConsumerName,
  Queue,
  statusAfter,
  type ParcelEventV1,
} from '@swiftdrop/contracts';
import type { ParcelEventConsumer } from '../messaging/parcel-event-consumer.js';

/**
 * Signed merchant webhooks with backoff retries.
 * Phase 4 scaffold: logs merchant events. Delivery arrives in Phase 5.
 */
@Injectable()
export class WebhookConsumer implements ParcelEventConsumer {
  readonly queue = Queue.WEBHOOKS;
  readonly name = ConsumerName.WEBHOOKS;
  private readonly logger = new Logger(WebhookConsumer.name);

  handle(event: ParcelEventV1): Promise<void> {
    if (event.merchantId === null) {
      return Promise.resolve(); // customer parcel: no merchant to notify
    }
    this.logger.log(
      `${event.eventType} ${event.trackingNumber} → ${statusAfter(event)} for merchant ${event.merchantId} (webhook delivery not implemented yet)`,
    );
    return Promise.resolve();
  }
}
