/** In-memory state. The mock store is a demo tool, so nothing is persisted. */

export type WebhookResult =
  'ACCEPTED' | 'DUPLICATE' | 'STALE' | 'BAD_SIGNATURE' | 'FAIL_MODE';

export interface ReceivedWebhook {
  readonly receivedAt: string;
  readonly eventId: string;
  readonly result: WebhookResult;
  readonly respondedWith: number;
  /** X-SwiftDrop-Delivery-Attempt: 1 = first try, higher = a retry. */
  readonly attempt: number | null;
  readonly payload: unknown;
}

/** The store's own view of an order's delivery status, kept up to date by webhooks. */
export interface ParcelView {
  readonly trackingNumber: string;
  readonly merchantOrderRef: string | null;
  readonly status: string;
  readonly sequence: number;
  readonly updatedAt: string;
}

export interface OrderAttempt {
  readonly sentAt: string;
  readonly merchantOrderRef: string;
  readonly status: number;
  readonly response: unknown;
}

export interface Settings {
  apiBaseUrl: string;
  apiKey: string;
  webhookSecret: string;
  failMode: boolean;
}

const MAX_ITEMS = 50;

export const settings: Settings = {
  apiBaseUrl: process.env.SWIFTDROP_API_URL ?? 'http://localhost:4000/api/v1',
  apiKey: '',
  webhookSecret: '',
  failMode: false,
};

export const webhooks: ReceivedWebhook[] = [];
export const parcels = new Map<string, ParcelView>();
export const orders: OrderAttempt[] = [];

export function recordWebhook(entry: ReceivedWebhook): void {
  webhooks.unshift(entry);
  webhooks.length = Math.min(webhooks.length, MAX_ITEMS);
}

export function recordOrder(entry: OrderAttempt): void {
  orders.unshift(entry);
  orders.length = Math.min(orders.length, MAX_ITEMS);
}

export function isDuplicate(eventId: string): boolean {
  return webhooks.some((w) => w.eventId === eventId && w.result === 'ACCEPTED');
}

/**
 * Applies a verified webhook to the store's order view. Retries can arrive
 * after a newer event, so a webhook whose `sequence` is not higher than the
 * last one applied for that tracking number is acknowledged but ignored —
 * exactly what the SwiftDrop docs ask merchants to do.
 */
export function applyWebhook(payload: unknown): 'ACCEPTED' | 'STALE' {
  if (typeof payload !== 'object' || payload === null) return 'ACCEPTED';
  const body = payload as Record<string, unknown>;
  const trackingNumber = body.trackingNumber;
  const sequence = body.sequence;
  if (typeof trackingNumber !== 'string' || typeof sequence !== 'number') {
    return 'ACCEPTED';
  }
  const current = parcels.get(trackingNumber);
  if (current && sequence <= current.sequence) return 'STALE';
  parcels.set(trackingNumber, {
    trackingNumber,
    merchantOrderRef:
      typeof body.merchantOrderRef === 'string' ? body.merchantOrderRef : null,
    status: typeof body.status === 'string' ? body.status : 'UNKNOWN',
    sequence,
    updatedAt:
      typeof body.occurredAt === 'string'
        ? body.occurredAt
        : new Date().toISOString(),
  });
  return 'ACCEPTED';
}

/** State for the browser page. Secrets are never sent back in full. */
export function publicState() {
  return {
    settings: {
      apiBaseUrl: settings.apiBaseUrl,
      apiKey: settings.apiKey ? `${settings.apiKey.slice(0, 11)}…` : '',
      webhookSecretSet: Boolean(settings.webhookSecret),
      failMode: settings.failMode,
    },
    webhooks,
    orders,
    parcels: [...parcels.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
  };
}
