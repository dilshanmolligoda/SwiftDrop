/** In-memory state. The mock store is a demo tool, so nothing is persisted. */

export type WebhookResult =
  'ACCEPTED' | 'DUPLICATE' | 'BAD_SIGNATURE' | 'FAIL_MODE';

export interface ReceivedWebhook {
  readonly receivedAt: string;
  readonly eventId: string;
  readonly result: WebhookResult;
  readonly respondedWith: number;
  readonly payload: unknown;
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
  };
}
