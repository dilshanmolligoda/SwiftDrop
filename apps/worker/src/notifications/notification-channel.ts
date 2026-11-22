import type { NotificationChannel as ChannelName } from '../generated/prisma/enums.js';

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

export interface Recipient {
  readonly userId: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly phoneNumber: string | null;
}

export interface RenderedNotification {
  /** Stable template name, stored in notifications.template. */
  readonly template: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** Short text for SMS (≤ 160 characters). */
  readonly sms: string;
  readonly attachments?: Array<{
    readonly filename: string;
    readonly content: Buffer | string;
    readonly contentType?: string;
  }>;
}

export type SendResult =
  | { readonly status: 'SENT' }
  /** Not sent on purpose (channel off, no address). */
  | { readonly status: 'SKIPPED'; readonly reason: string }
  /** Rejected for good (e.g. mailbox does not exist) — do not retry. */
  | { readonly status: 'FAILED'; readonly reason: string };

/**
 * One way of reaching a customer (Strategy). Throw for a temporary problem
 * (server down, timeout): the message is retried with backoff.
 */
export interface NotificationChannel {
  readonly channel: ChannelName;
  send(
    recipient: Recipient,
    message: RenderedNotification,
  ): Promise<SendResult>;
}

/** j***@example.com — for logs, which must not contain personal data. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

/** ******1234 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 4 ? `******${digits.slice(-4)}` : '****';
}
