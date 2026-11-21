import { parseParcelEvent } from '@swiftdrop/contracts';
import type { ProcessedEventsStore } from '../idempotency/processed-events.store.js';
import {
  PermanentFailure,
  type DeliveryInfo,
  type ParcelEventConsumer,
} from './parcel-event-consumer.js';

/**
 * What to do with a message once processing finished:
 * - `ack`: done (handled now, or already handled before)
 * - `retry`: temporary problem; put it back on the queue after a delay. The
 *   quorum queue's delivery limit dead-letters it if it keeps failing.
 * - `dead-letter`: can never succeed; move it to the DLQ for inspection.
 */
export type Outcome =
  | { readonly action: 'ack'; readonly detail: 'handled' | 'duplicate' }
  | { readonly action: 'retry'; readonly reason: string }
  | { readonly action: 'dead-letter'; readonly reason: string };

export interface IncomingMessage {
  readonly content: Buffer;
  readonly delivery: DeliveryInfo;
}

type Store = Pick<ProcessedEventsStore, 'isProcessed' | 'markProcessed'>;

/** Pure decision logic, independent of RabbitMQ so it can be unit tested. */
export async function processMessage(
  message: IncomingMessage,
  consumer: ParcelEventConsumer,
  store: Store,
): Promise<Outcome> {
  const parsed = parseParcelEvent(message.content);
  if (!parsed.ok) {
    return {
      action: 'dead-letter',
      reason: `invalid message: ${parsed.error}`,
    };
  }
  const event = parsed.value;

  try {
    if (await store.isProcessed(event.eventId, consumer.name)) {
      return { action: 'ack', detail: 'duplicate' };
    }
    await consumer.handle(event, message.delivery);
    await store.markProcessed(event.eventId, consumer.name);
    return { action: 'ack', detail: 'handled' };
  } catch (error: unknown) {
    const reason = describeError(error);
    return error instanceof PermanentFailure
      ? { action: 'dead-letter', reason }
      : { action: 'retry', reason };
  }
}

/**
 * Header the worker sets on a message it re-publishes for another try.
 *
 * Needed because RabbitMQ 4 quorum queues don't count a consumer's
 * nack-with-requeue towards `x-delivery-limit` (only crashes count), so a
 * plain requeue would retry a failing message forever.
 */
export const PROCESSING_ATTEMPT_HEADER = 'x-swiftdrop-processing-attempt';

/** Total tries (first + retries) before a message goes to the dead-letter queue. */
export const MAX_PROCESSING_ATTEMPTS = 10;

/** Upper bound for the wait before a failed message is retried. */
export const MAX_RETRY_DELAY_MS = 5 * 60_000;

export type RetryPlan =
  | {
      readonly action: 'republish';
      readonly delayMs: number;
      readonly nextAttempt: number;
    }
  | { readonly action: 'dead-letter'; readonly attempts: number };

/**
 * What to do after attempt `attempt` failed with a temporary error. The wait
 * doubles each time from `baseMs`, capped at MAX_RETRY_DELAY_MS: with a 5 s
 * base the worker rides out about 20 minutes of outage (e.g. the database
 * restarting) before dead-lettering.
 */
export function planRetry(attempt: number, baseMs: number): RetryPlan {
  if (attempt >= MAX_PROCESSING_ATTEMPTS) {
    return { action: 'dead-letter', attempts: attempt };
  }
  return {
    action: 'republish',
    delayMs: Math.min(baseMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS),
    nextAttempt: attempt + 1,
  };
}

/** 1-based attempt number carried by a message (1 when absent or invalid). */
export function attemptOf(headers: Readonly<Record<string, unknown>>): number {
  const value = headers[PROCESSING_ATTEMPT_HEADER];
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : 1;
}

/** First non-empty line of an error message (Prisma errors start with a newline). */
function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const fallback = error instanceof Error ? error.name : 'unknown error';
  return (line ?? fallback).slice(0, 300);
}
