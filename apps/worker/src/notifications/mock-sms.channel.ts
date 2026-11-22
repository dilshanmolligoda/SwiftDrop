import { Inject, Injectable, Logger } from '@nestjs/common';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker.config.js';
import {
  maskPhone,
  type NotificationChannel,
  type Recipient,
  type RenderedNotification,
  type SendResult,
  type SendSmsOptions,
} from './notification-channel.js';

/**
 * Stand-in for an SMS provider (SMS_PROVIDER=mock): logs the text with the
 * number masked and reports it as sent, so the notifications table shows what
 * would have gone out. Replace with a real adapter behind the same interface.
 */
@Injectable()
export class MockSmsChannel implements NotificationChannel {
  readonly channel = 'SMS' as const;
  private readonly logger = new Logger(MockSmsChannel.name);

  constructor(@Inject(WORKER_CONFIG) private readonly config: WorkerConfig) {}

  send(
    recipientOrOptions: Recipient | SendSmsOptions,
    message?: RenderedNotification,
  ): Promise<SendResult> {
    if (this.config.notifications.smsProvider !== 'mock') {
      return Promise.resolve({ status: 'SKIPPED', reason: 'SMS is disabled' });
    }

    const phone =
      'to' in recipientOrOptions
        ? recipientOrOptions.to
        : recipientOrOptions.phoneNumber;
    const text =
      'message' in recipientOrOptions
        ? recipientOrOptions.message
        : (message?.sms ?? '');

    if (!phone) {
      return Promise.resolve({
        status: 'SKIPPED',
        reason: 'recipient has no phone number',
      });
    }
    this.logger.log(`[mock SMS to ${maskPhone(phone)}] ${text}`);
    return Promise.resolve({ status: 'SENT' });
  }
}
