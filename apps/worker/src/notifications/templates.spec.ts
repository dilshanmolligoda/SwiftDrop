import type { ParcelEventV1 } from '@swiftdrop/contracts';
import { DEFAULT_NOTIFY_STATUSES } from '../config/worker.config.js';
import { escapeHtml, renderNotification } from './templates.js';

const base = {
  eventId: '6f1c2c8e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
  version: 1 as const,
  occurredAt: '2026-11-21T08:30:00.000Z',
  parcelId: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
  trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
  merchantId: null,
  courierId: null,
  sequence: 2,
};

const changed = (
  newStatus: string,
  failureReason: string | null = null,
): ParcelEventV1 =>
  ({
    ...base,
    eventType: 'parcel.status.changed',
    previousStatus: 'IN_TRANSIT',
    newStatus,
    failureReason,
  }) as ParcelEventV1;

const options = {
  recipientName: 'Nimal Perera',
  webAppUrl: 'http://localhost:5173/',
  notifyStatuses: new Set(DEFAULT_NOTIFY_STATUSES),
};

describe('renderNotification', () => {
  it('renders a delivered message with text, HTML and SMS', () => {
    const message = renderNotification(changed('DELIVERED'), options);
    expect(message).toMatchObject({
      template: 'parcel-delivered',
      subject: 'Your parcel has been delivered',
    });
    expect(message!.text).toContain('Hi Nimal,');
    expect(message!.text).toContain(base.trackingNumber);
    expect(message!.html).toContain('Delivered');
    expect(message!.sms.length).toBeLessThanOrEqual(160);
  });

  it('confirms a new booking', () => {
    const message = renderNotification(
      { ...base, eventType: 'parcel.created', status: 'PENDING' },
      options,
    );
    expect(message?.template).toBe('parcel-booked');
  });

  it('explains a failed delivery in plain words', () => {
    const message = renderNotification(
      changed('FAILED', 'RECIPIENT_UNAVAILABLE'),
      options,
    );
    expect(message!.text).toContain('nobody was available to receive it');
  });

  it('stays silent for statuses customers do not need', () => {
    expect(renderNotification(changed('ASSIGNED'), options)).toBeNull();
    expect(renderNotification(changed('IN_TRANSIT'), options)).toBeNull();
  });

  it('follows the configured status list', () => {
    const onlyDelivered = {
      ...options,
      notifyStatuses: new Set(['DELIVERED' as const]),
    };
    expect(renderNotification(changed('PICKED_UP'), onlyDelivered)).toBeNull();
    expect(
      renderNotification(changed('DELIVERED'), onlyDelivered),
    ).not.toBeNull();
  });

  it('never puts the tracking number in the link', () => {
    const message = renderNotification(changed('OUT_FOR_DELIVERY'), options)!;
    expect(message.text).toContain(
      'Track it: http://localhost:5173/customer/tracking',
    );
    expect(message.html).toContain(
      'href="http://localhost:5173/customer/tracking"',
    );
    expect(message.html).not.toMatch(/href="[^"]*SD-0123/);
  });

  it('escapes the customer name in HTML', () => {
    const message = renderNotification(changed('DELIVERED'), {
      ...options,
      recipientName: '<script>alert(1)</script> Silva',
    })!;
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });
});

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
