import { ParcelEventType } from '../events/parcel-events.js';

/**
 * Names of everything SwiftDrop declares in RabbitMQ. The API and the worker
 * both declare this topology on startup (declarations are idempotent), so use
 * these constants instead of typing names by hand.
 *
 *   parcel.events (topic) ──parcel.#──► notifications.parcel-status ─► worker
 *                         ──parcel.#──► webhooks.parcel-status ──────► worker
 *                         ──parcel.#──► realtime.{instanceId} ───────► each api
 *
 *   webhooks.retry.N  — delay queue; on TTL expiry dead-letters back to webhooks.parcel-status
 *   *.dead-letter     — messages that gave up, kept for inspection / manual replay
 *
 * Consumers acknowledge (and ignore) event types they don't handle.
 */

/** Default name; the API may override it with RABBITMQ_EVENTS_EXCHANGE. */
export const PARCEL_EVENTS_EXCHANGE = 'parcel.events';

export const RoutingKey = {
  PARCEL_CREATED: ParcelEventType.CREATED,
  PARCEL_STATUS_CHANGED: ParcelEventType.STATUS_CHANGED,
  /** Binding pattern that matches every parcel event. */
  ALL_PARCEL_EVENTS: 'parcel.#',
} as const;

export const Queue = {
  NOTIFICATIONS: 'notifications.parcel-status',
  NOTIFICATIONS_DEAD_LETTER: 'notifications.dead-letter',
  WEBHOOKS: 'webhooks.parcel-status',
  WEBHOOKS_DEAD_LETTER: 'webhooks.dead-letter',
} as const;
export type Queue = (typeof Queue)[keyof typeof Queue];

/** Delay queue holding a webhook message before its next attempt. */
export function webhookRetryQueue(failedAttempt: number): string {
  if (!Number.isInteger(failedAttempt) || failedAttempt < 1) {
    throw new Error('failedAttempt must be a positive integer');
  }
  return `webhooks.retry.${failedAttempt}`;
}

/** Per-API-instance queue feeding that instance's WebSocket clients. */
export function realtimeQueue(instanceId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(instanceId)) {
    throw new Error('instanceId must be 1-64 letters, digits, "-" or "_"');
  }
  return `realtime.${instanceId}`;
}

/** AMQP message headers SwiftDrop sets (in addition to messageId = eventId). */
export const MessageHeader = {
  /** 1-based attempt number of the next webhook delivery. */
  ATTEMPT: 'x-swiftdrop-attempt',
  /** Why a message was dead-lettered, for people inspecting the DLQ. */
  DEAD_LETTER_REASON: 'x-swiftdrop-dead-letter-reason',
} as const;

/** Names stored in `processed_events.consumer` for idempotency. */
export const ConsumerName = {
  NOTIFICATIONS: 'worker.notifications',
  WEBHOOKS: 'worker.webhooks',
} as const;
export type ConsumerName = (typeof ConsumerName)[keyof typeof ConsumerName];
