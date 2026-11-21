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

// ---------------------------------------------------------------------
// Declarations both the API and the worker apply on startup
// ---------------------------------------------------------------------

export interface ExchangeDeclaration {
  readonly name: string;
  readonly type: 'topic';
  readonly options: { readonly durable: boolean };
}

export interface QueueDeclaration {
  readonly name: string;
  readonly options: {
    readonly durable: boolean;
    readonly arguments: Readonly<Record<string, string | number>>;
  };
  readonly bindings: ReadonlyArray<{
    readonly exchange: string;
    readonly pattern: string;
  }>;
}

export interface Topology {
  readonly exchanges: readonly ExchangeDeclaration[];
  readonly queues: readonly QueueDeclaration[];
}

/**
 * Redeliveries before a message is treated as poison and dead-lettered
 * (e.g. a consumer that crashes on it every time).
 */
export const QUEUE_DELIVERY_LIMIT = 10;

/**
 * The durable part of the topology: the exchange, the two work queues and
 * their dead-letter queues. Work queues are quorum queues so a message that
 * keeps crashing its consumer goes to the DLQ after QUEUE_DELIVERY_LIMIT tries.
 *
 * Declared by the API as well as the worker, so events published before the
 * worker first starts are kept instead of being dropped as unroutable.
 *
 * Arguments must never change for an existing queue (RabbitMQ rejects the
 * redeclaration). To change them, create a queue with a new name.
 */
export function parcelEventsTopology(
  exchange: string = PARCEL_EVENTS_EXCHANGE,
): Topology {
  return {
    exchanges: [{ name: exchange, type: 'topic', options: { durable: true } }],
    queues: [
      workQueue(Queue.NOTIFICATIONS, Queue.NOTIFICATIONS_DEAD_LETTER, exchange),
      deadLetterQueue(Queue.NOTIFICATIONS_DEAD_LETTER),
      workQueue(Queue.WEBHOOKS, Queue.WEBHOOKS_DEAD_LETTER, exchange),
      deadLetterQueue(Queue.WEBHOOKS_DEAD_LETTER),
    ],
  };
}

function workQueue(
  name: string,
  deadLetterQueueName: string,
  exchange: string,
): QueueDeclaration {
  return {
    name,
    options: {
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-delivery-limit': QUEUE_DELIVERY_LIMIT,
        // '' = default exchange, which routes by queue name
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': deadLetterQueueName,
      },
    },
    bindings: [{ exchange, pattern: RoutingKey.ALL_PARCEL_EVENTS }],
  };
}

function deadLetterQueue(name: string): QueueDeclaration {
  return {
    name,
    options: { durable: true, arguments: { 'x-queue-type': 'quorum' } },
    bindings: [],
  };
}

/** The part of an amqplib channel that applyTopology needs. */
export interface TopologyChannel {
  assertExchange(
    exchange: string,
    type: string,
    options?: { durable?: boolean },
  ): Promise<unknown>;
  assertQueue(
    queue: string,
    options?: { durable?: boolean; arguments?: Record<string, unknown> },
  ): Promise<unknown>;
  bindQueue(queue: string, source: string, pattern: string): Promise<unknown>;
}

/** Declares exchanges, then queues and their bindings. Safe to call on every (re)connect. */
export async function applyTopology(
  channel: TopologyChannel,
  topology: Topology,
): Promise<void> {
  for (const exchange of topology.exchanges) {
    await channel.assertExchange(exchange.name, exchange.type, {
      durable: exchange.options.durable,
    });
  }
  for (const queue of topology.queues) {
    await channel.assertQueue(queue.name, {
      durable: queue.options.durable,
      arguments: { ...queue.options.arguments },
    });
    for (const binding of queue.bindings) {
      await channel.bindQueue(queue.name, binding.exchange, binding.pattern);
    }
  }
}
