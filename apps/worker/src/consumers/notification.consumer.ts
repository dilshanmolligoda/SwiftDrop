import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ConsumerName,
  Queue,
  statusAfter,
  type ParcelEventV1,
  type ParcelStatusChangedV1,
} from '@swiftdrop/contracts';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker.config.js';
import type { ParcelEventConsumer } from '../messaging/parcel-event-consumer.js';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
} from '../notifications/notification-channel.js';
import { NotificationRepository } from '../notifications/notification.repository.js';
import { renderNotification } from '../notifications/templates.js';

/**
 * Tells the customer who booked a parcel about its progress, on every
 * configured channel (email, mock SMS).
 *
 * Each (event, channel, customer) gets exactly one row in `notifications`.
 * A channel that already has a row is skipped, so when one channel fails
 * temporarily and the message is retried, the others are not sent twice.
 */
@Injectable()
export class NotificationConsumer implements ParcelEventConsumer {
  readonly queue = Queue.NOTIFICATIONS;
  readonly name = ConsumerName.NOTIFICATIONS;
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(
    private readonly repository: NotificationRepository,
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannel[],
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  async handle(event: ParcelEventV1): Promise<void> {
    const { notifications } = this.config;
    // Cheap check first: most events need no database work at all.
    if (
      event.eventType === 'parcel.status.changed' &&
      !notifications.notifyStatuses.has(statusAfter(event))
    ) {
      if (event.newStatus === 'IN_TRANSIT') {
        const recipient = await this.repository.findRecipient(event.parcelId);
        if (recipient) {
          if (
            !(await this.repository.alreadyHandled(
              event.eventId,
              'IN_APP',
              recipient.userId,
            ))
          ) {
            await this.repository.record({
              eventId: event.eventId,
              channel: 'IN_APP',
              recipientUserId: recipient.userId,
              template: 'parcel_in_transit',
              status: 'SENT',
              errorMessage: null,
            });
          }
        }
      }
      return;
    }

    const recipient = await this.repository.findRecipient(event.parcelId);
    if (!recipient) {
      this.logger.debug(`No active customer for event ${event.eventId}`);
      return;
    }

    const message = renderNotification(event, {
      recipientName: recipient.fullName,
      webAppUrl: notifications.webAppUrl,
      notifyStatuses: notifications.notifyStatuses,
    });
    if (!message) return;

    // Channels run one after another; a thrown error stops here and the
    // whole message is retried — channels already recorded are skipped then.
    for (const channel of this.channels) {
      if (
        await this.repository.alreadyHandled(
          event.eventId,
          channel.channel,
          recipient.userId,
        )
      ) {
        continue;
      }
      const result = await channel.send(recipient, message);
      await this.repository.record({
        eventId: event.eventId,
        channel: channel.channel,
        recipientUserId: recipient.userId,
        template: message.template,
        status: result.status,
        errorMessage: result.status === 'SENT' ? null : result.reason,
      });
    }

    if (
      event.eventType === 'parcel.status.changed' &&
      event.newStatus === 'ASSIGNED' &&
      event.courierId
    ) {
      if (
        !(await this.repository.alreadyHandled(
          event.eventId,
          'IN_APP',
          event.courierId,
        ))
      ) {
        await this.repository.record({
          eventId: event.eventId,
          channel: 'IN_APP',
          recipientUserId: event.courierId,
          template: 'courier_new_assignment',
          status: 'SENT',
          errorMessage: null,
        });
      }
    }

    if (
      event.eventType === 'parcel.status.changed' &&
      event.newStatus === 'PICKED_UP'
    ) {
      await this.handleRecipientPickedUpSms(event);
    }

    if (
      event.eventType === 'parcel.status.changed' &&
      event.newStatus === 'OUT_FOR_DELIVERY'
    ) {
      await this.handleRecipientOutForDeliverySms(event);
    }

    if (
      event.eventType === 'parcel.status.changed' &&
      event.newStatus === 'DELIVERED'
    ) {
      await this.handleRecipientDeliveredSms(event);
    }

    if (
      event.eventType === 'parcel.status.changed' &&
      event.newStatus === 'FAILED' &&
      (event.failureReason === 'RECIPIENT_UNAVAILABLE' ||
        event.failureReason === 'UNABLE_TO_CONTACT')
    ) {
      await this.handleRecipientMissedDeliverySms(event);
    }
  }

  private async handleRecipientMissedDeliverySms(
    event: ParcelStatusChangedV1,
  ): Promise<void> {
    const parcel = await this.repository.findParcel(event.parcelId);
    if (!parcel || !parcel.recipientPhone) return;

    const recipientEventId = this.deterministicUuid(
      `${event.eventId}:recipient:failed:sms`,
    );
    const recipientUser = await this.repository.findUserByPhone(
      parcel.recipientPhone,
    );
    const recipientUserId = recipientUser?.id ?? parcel.customerId;

    if (
      await this.repository.alreadyHandled(
        recipientEventId,
        'SMS',
        recipientUserId,
      )
    ) {
      return;
    }

    const message = `SwiftDrop missed you: We attempted delivery for parcel ${event.trackingNumber} but could not reach you. Our courier will re-attempt or contact customer support.`;

    const smsChannel = this.channels.find((c) => c.channel === 'SMS');
    if (!smsChannel) return;

    const result = await smsChannel.send({
      to: parcel.recipientPhone,
      message,
    });

    await this.repository.record({
      eventId: recipientEventId,
      channel: 'SMS',
      recipientUserId,
      template: 'recipient_delivery_attempt_failed',
      title: 'Missed delivery attempt',
      description: message,
      status: result.status,
      errorMessage: result.status === 'SENT' ? null : result.reason,
    });
  }

  private async handleRecipientDeliveredSms(
    event: ParcelStatusChangedV1,
  ): Promise<void> {
    const parcel = await this.repository.findParcel(event.parcelId);
    if (!parcel || !parcel.recipientPhone) return;

    const recipientEventId = this.deterministicUuid(
      `${event.eventId}:recipient:delivered:sms`,
    );
    const recipientUser = await this.repository.findUserByPhone(
      parcel.recipientPhone,
    );
    const recipientUserId = recipientUser?.id ?? parcel.customerId;

    if (
      await this.repository.alreadyHandled(
        recipientEventId,
        'SMS',
        recipientUserId,
      )
    ) {
      return;
    }

    const message = `SwiftDrop: Package ${event.trackingNumber} was successfully delivered. Thank you for choosing SwiftDrop!`;

    const smsChannel = this.channels.find((c) => c.channel === 'SMS');
    if (!smsChannel) return;

    const result = await smsChannel.send({
      to: parcel.recipientPhone,
      message,
    });

    await this.repository.record({
      eventId: recipientEventId,
      channel: 'SMS',
      recipientUserId,
      template: 'recipient_delivered',
      title: 'Package delivered',
      description: message,
      status: result.status,
      errorMessage: result.status === 'SENT' ? null : result.reason,
    });
  }

  private async handleRecipientOutForDeliverySms(
    event: ParcelStatusChangedV1,
  ): Promise<void> {
    const parcel = await this.repository.findParcel(event.parcelId);
    if (!parcel || !parcel.recipientPhone) return;

    const recipientEventId = this.deterministicUuid(
      `${event.eventId}:recipient:out-for-delivery:sms`,
    );
    const recipientUser = await this.repository.findUserByPhone(
      parcel.recipientPhone,
    );
    const recipientUserId = recipientUser?.id ?? parcel.customerId;

    if (
      await this.repository.alreadyHandled(
        recipientEventId,
        'SMS',
        recipientUserId,
      )
    ) {
      return;
    }

    const message = `SwiftDrop Alert: Your package ${event.trackingNumber} is out for delivery today to your address. Please ensure someone is available.`;

    const smsChannel = this.channels.find((c) => c.channel === 'SMS');
    if (!smsChannel) return;

    const result = await smsChannel.send({
      to: parcel.recipientPhone,
      message,
    });

    await this.repository.record({
      eventId: recipientEventId,
      channel: 'SMS',
      recipientUserId,
      template: 'recipient_out_for_delivery',
      title: 'Out for delivery today',
      description: message,
      status: result.status,
      errorMessage: result.status === 'SENT' ? null : result.reason,
    });
  }

  private async handleRecipientPickedUpSms(
    event: ParcelStatusChangedV1,
  ): Promise<void> {
    const parcel = await this.repository.findParcel(event.parcelId);
    if (!parcel || !parcel.recipientPhone) return;

    const recipientEventId = this.deterministicUuid(
      `${event.eventId}:recipient:sms`,
    );
    const recipientUser = await this.repository.findUserByPhone(
      parcel.recipientPhone,
    );
    const recipientUserId = recipientUser?.id ?? parcel.customerId;

    if (
      await this.repository.alreadyHandled(
        recipientEventId,
        'SMS',
        recipientUserId,
      )
    ) {
      return;
    }

    const baseUrl = (
      process.env.PUBLIC_TRACKING_URL ||
      `${this.config.notifications.webAppUrl.replace(/\/+$/, '')}/tracking`
    ).replace(/\/+$/, '');
    const trackingUrl = `${baseUrl}/${event.trackingNumber}`;
    const message = `Hello! ${parcel.senderName} has sent you a package via SwiftDrop (${event.trackingNumber}). Track live: ${trackingUrl}`;

    const smsChannel = this.channels.find((c) => c.channel === 'SMS');
    if (!smsChannel) return;

    const result = await smsChannel.send({
      to: parcel.recipientPhone,
      message,
    });

    await this.repository.record({
      eventId: recipientEventId,
      channel: 'SMS',
      recipientUserId,
      template: 'recipient_parcel_dispatched',
      title: 'Shipment dispatched',
      description: message,
      status: result.status,
      errorMessage: result.status === 'SENT' ? null : result.reason,
    });
  }

  private deterministicUuid(source: string): string {
    const hash = createHash('sha256').update(source).digest('hex');
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16),
      '8' + hash.substring(17, 20),
      hash.substring(20, 32),
    ].join('-');
  }
}
