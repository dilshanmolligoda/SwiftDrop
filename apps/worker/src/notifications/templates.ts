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
        subject: `Delivery Cancelled: Parcel ${event.trackingNumber}`,
        headline: 'Delivery cancelled',
        body: `Your delivery request ${event.trackingNumber} was cancelled. Fee adjustment or refund will be confirmed.`,
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

export function renderWebhookDeadLetterEmail(
  merchantName: string,
  endpointUrl: string,
  webAppUrl: string,
): RenderedNotification {
  const subject = 'Urgent: Webhook Delivery Failure - SwiftDrop';
  const text = `Hello ${merchantName},\n\nUrgent: Webhook delivery failure for endpoint ${endpointUrl}. Events could not be delivered after 6 attempts.\n\nPlease check your webhook endpoint.\n\nBest regards,\nThe SwiftDrop Team`;
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Webhook Delivery Failure</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 36px 32px; text-align: center;">
              <h1 style="color: #ffffff; font-size: 26px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">SwiftDrop</h1>
              <p style="color: #cbd5e1; font-size: 14px; margin: 8px 0 0 0; font-weight: 500;">Merchant Operations Alert</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 36px;">
              <h2 style="font-size: 20px; font-weight: 600; color: #dc2626; margin-top: 0; margin-bottom: 20px;">Webhook Delivery Failure</h2>
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">Hello ${merchantName},</p>
              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
                Urgent: Webhook delivery failure for endpoint <strong>${endpointUrl}</strong>. Events could not be delivered after 6 attempts.
              </p>
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 14px; color: #991b1b; line-height: 1.5;">
                  <strong>Endpoint:</strong> ${endpointUrl}<br>
                  <strong>Status:</strong> Dead-lettered after maximum retry attempts reached.
                </p>
              </div>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${webAppUrl}/merchant/webhooks" style="background-color: #0f172a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Manage Webhook Settings</a>
              </div>
              <p style="font-size: 14px; line-height: 1.6; color: #64748b;">
                Please verify that your server is reachable and accepting POST requests with valid HMAC signatures.
              </p>
              <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin-top: 24px;">
                Best regards,<br>
                <strong>The SwiftDrop Operations Team</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    template: 'merchant_webhook_dead_letter',
    subject,
    text,
    html,
    sms: `SwiftDrop: Webhook delivery failure for endpoint ${endpointUrl}.`.slice(
      0,
      160,
    ),
  };
}
