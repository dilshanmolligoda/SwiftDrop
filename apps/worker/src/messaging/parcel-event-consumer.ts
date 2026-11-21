import type { ConsumerName, ParcelEventV1, Queue } from '@swiftdrop/contracts';

export const PARCEL_EVENT_CONSUMERS = Symbol('PARCEL_EVENT_CONSUMERS');

export interface DeliveryInfo {
  /** True when RabbitMQ has delivered this message before (crash, nack, restart). */
  readonly redelivered: boolean;
  readonly headers: Readonly<Record<string, unknown>>;
}

/**
 * One reaction to parcel events (notifications, webhooks, …), bound to its
 * own queue. The ConsumerRunner handles parsing, dedupe, ack/nack and retries;
 * implementations only do the work.
 *
 * `handle` must be idempotent: if the worker dies after the work but before
 * the event is marked processed, the same event arrives again.
 */
/**
 * `'deferred'`: the consumer has scheduled a later attempt itself (e.g. a
 * webhook retry queue), so the event must NOT be marked processed yet —
 * otherwise the scheduled attempt would be skipped as a duplicate.
 */
export type HandleResult = void | 'deferred';

export interface ParcelEventConsumer {
  readonly queue: Queue;
  /** Stored in processed_events; must be unique per consumer. */
  readonly name: ConsumerName;
  handle(event: ParcelEventV1, delivery: DeliveryInfo): Promise<HandleResult>;
}

/**
 * Throw this when retrying can never succeed (e.g. the event references data
 * that doesn't exist). The message goes straight to the dead-letter queue.
 * Any other error is treated as temporary and retried.
 */
export class PermanentFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentFailure';
  }
}
