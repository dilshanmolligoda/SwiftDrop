import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker.config.js';
import {
  maskEmail,
  type NotificationChannel,
  type Recipient,
  type RenderedNotification,
  type SendResult,
} from './notification-channel.js';

/**
 * Email over SMTP (Mailpit in development — every message shows up at
 * http://localhost:8025). A 5xx SMTP answer for the recipient is permanent;
 * anything else (connection refused, timeout, 4xx) is thrown so the worker
 * retries with backoff.
 */
@Injectable()
export class EmailChannel implements NotificationChannel, OnModuleDestroy {
  readonly channel = 'EMAIL' as const;
  private readonly logger = new Logger(EmailChannel.name);
  private transporter?: Transporter;

  constructor(@Inject(WORKER_CONFIG) private readonly config: WorkerConfig) {}

  async send(
    recipient: Recipient,
    message: RenderedNotification,
  ): Promise<SendResult> {
    const { email } = this.config.notifications;
    if (!email.enabled) {
      return { status: 'SKIPPED', reason: 'email notifications are disabled' };
    }
    if (!recipient.email) {
      return { status: 'SKIPPED', reason: 'recipient has no email address' };
    }

    try {
      await this.transport().sendMail({
        from: email.from,
        to: { name: recipient.fullName, address: recipient.email },
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.attachments ? { attachments: message.attachments } : {}),
      });
      this.logger.log(
        `Sent "${message.template}" to ${maskEmail(recipient.email)}`,
      );
      return { status: 'SENT' };
    } catch (error: unknown) {
      const code = (error as { responseCode?: number }).responseCode;
      if (typeof code === 'number' && code >= 500 && code < 600) {
        return { status: 'FAILED', reason: `SMTP ${code}` };
      }
      throw error; // temporary — retried by the consumer runner
    }
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  private transport(): Transporter {
    if (!this.transporter) {
      const { email } = this.config.notifications;
      this.transporter = nodemailer.createTransport({
        host: email.host,
        port: email.port,
        secure: email.port === 465,
        auth: email.user
          ? { user: email.user, pass: email.password }
          : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
    return this.transporter;
  }
}
