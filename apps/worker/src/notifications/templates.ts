import {
  statusAfter,
  type DeliveryFailureReason,
  type ParcelEventV1,
  type ParcelStatus,
} from '@swiftdrop/contracts';
import type { RenderedNotification } from './notification-channel.js';

interface Copy {
  readonly template: string;
  readonly subject: string;
  readonly headline: string;
  readonly body: string;
}

const FAILURE_REASONS: Record<DeliveryFailureReason, string> = {
  RECIPIENT_UNAVAILABLE: 'nobody was available to receive it',
  INCORRECT_ADDRESS: 'the address could not be found',
  RECIPIENT_REJECTED: 'the recipient refused it',
  UNABLE_TO_CONTACT: 'the courier could not reach the recipient',
  OTHER: 'of a delivery problem',
};

function copyFor(event: ParcelEventV1): Copy | null {
  if (event.eventType === 'parcel.created') {
    return {
      template: 'parcel-booked',
      subject: 'Your delivery is booked',
      headline: 'We have your booking',
      body: 'Your delivery request is confirmed. We will let you know when a courier picks it up.',
    };
  }
  switch (statusAfter(event)) {
    case 'ASSIGNED':
      return {
        template: 'parcel-assigned',
        subject: `Courier Assigned — Parcel ${event.trackingNumber}`,
        headline: 'Courier assigned',
        body: `A courier has been assigned to collect your parcel ${event.trackingNumber}.`,
      };
    case 'PICKED_UP':
      return {
        template: 'parcel-picked-up',
        subject: `Parcel Picked Up — ${event.trackingNumber}`,
        headline: 'Parcel picked up',
        body: 'Your parcel has been collected by our courier and is now on its way to the distribution hub.',
      };
    case 'IN_TRANSIT':
      return {
        template: 'parcel-in-transit',
        subject: 'Your parcel is on its way',
        headline: 'In transit',
        body: 'Your parcel is moving through our network.',
      };
    case 'OUT_FOR_DELIVERY':
      return {
        template: 'parcel-out-for-delivery',
        subject: 'Your parcel is out for delivery',
        headline: 'Out for delivery',
        body: 'Your parcel is with the courier and will arrive today.',
      };
    case 'DELIVERED':
      return {
        template: 'parcel-delivered',
        subject: 'Your parcel has been delivered',
        headline: 'Delivered',
        body: 'Your parcel has been delivered. Thank you for using SwiftDrop.',
      };
    case 'FAILED': {
      const reason =
        event.eventType === 'parcel.status.changed' && event.failureReason
          ? FAILURE_REASONS[event.failureReason]
          : FAILURE_REASONS.OTHER;
      return {
        template: 'parcel-delivery-failed',
        subject: `Delivery Attempt Failed: Parcel ${event.trackingNumber}`,
        headline: 'Delivery needs attention',
        body: `We tried to deliver your parcel, but could not because ${reason}. We will be in touch about the next attempt.`,
      };
    }
    case 'RETURNED':
      return {
        template: 'parcel-returned',
        subject: 'Your parcel is being returned',
        headline: 'Returned to sender',
        body: 'Your parcel could not be delivered and is being returned to the sender.',
      };
    default:
      return null;
  }
}

/**
 * Builds the message for an event, or null when customers are not told about
 * it. Only the tracking number and status appear — no addresses or phone
 * numbers. The tracking number is never put in the link (see tracking README).
 */
export function renderNotification(
  event: ParcelEventV1,
  options: {
    readonly recipientName: string;
    readonly webAppUrl: string;
    readonly notifyStatuses: ReadonlySet<ParcelStatus>;
  },
): RenderedNotification | null {
  if (
    event.eventType === 'parcel.status.changed' &&
    !options.notifyStatuses.has(event.newStatus)
  ) {
    return null;
  }
  const copy = copyFor(event);
  if (!copy) return null;

  const name = firstName(options.recipientName);
  const link = `${options.webAppUrl.replace(/\/+$/, '')}/customer/tracking`;
  const tracking = event.trackingNumber;

  const text = [
    `Hi ${name},`,
    '',
    copy.body,
    '',
    `Tracking number: ${tracking}`,
    `Track it: ${link}`,
    '',
    '— SwiftDrop',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:12px;color:#6b7280;margin:0 0 8px">SwiftDrop</p>
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(copy.headline)}</h1>
<p>Hi ${escapeHtml(name)},</p>
<p>${escapeHtml(copy.body)}</p>
<p style="background:#f3f4f6;padding:12px;border-radius:6px">Tracking number<br><strong style="font-family:monospace">${escapeHtml(tracking)}</strong></p>
<p><a href="${escapeHtml(link)}" style="color:#2563eb">Track your parcel</a></p>
</body></html>`;

  const sms = `SwiftDrop: ${copy.subject}. Tracking ${tracking}.`.slice(0, 160);

  return { template: copy.template, subject: copy.subject, text, html, sms };
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'there';
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
