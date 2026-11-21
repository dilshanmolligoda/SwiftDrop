# apps/worker — Event consumers (NestJS standalone)

Separate process that consumes parcel events from RabbitMQ. It runs in its own container,
so a slow email server or a broken merchant endpoint never slows down the API.

```text
API: status change → outbox_events → relay → RabbitMQ parcel.events
                                               ├─ notifications.parcel-status → NotificationConsumer
                                               └─ webhooks.parcel-status      → WebhookConsumer
```

## Consumers

| Consumer | Queue | Does | Status |
|---|---|---|---|
| `NotificationConsumer` | `notifications.parcel-status` | Email (Mailpit in dev) / mock SMS, records the result | Logs only — Phase 6 |
| `WebhookConsumer` | `webhooks.parcel-status` | Signed webhook to the merchant, backoff retries, dead-letter | Logs only — Phase 5 |

## Run it

```bash
npm run dev:worker          # from the repo root (watch mode)
npm test -w apps/worker
```

Outside Docker the hosts in the root `.env` (`postgres`, `rabbitmq`) don't resolve. Create
`apps/worker/.env` (git-ignored) with local values:

```bash
DATABASE_URL=postgresql://swiftdrop:<password>@localhost:5434/swiftdrop?schema=public
RABBITMQ_URL=amqp://swiftdrop:<password>@localhost:5672
```

In Docker it starts with `docker compose --profile app up -d`. Health:
`docker compose exec worker wget -qO- localhost:4010/health`.

## How a message is processed

`messaging/message-processor.ts` decides, `messaging/consumer-runner.ts` applies it:

| Situation | Result |
|---|---|
| Handled successfully | `ack`, row in `processed_events` |
| Already in `processed_events` (redelivery) | `ack`, handler not called again |
| Not valid JSON / unknown version / bad fields | Dead-letter queue at once |
| Handler throws `PermanentFailure` | Dead-letter queue at once |
| Handler throws anything else (DB down, SMTP timeout …) | Wait, re-publish with `x-swiftdrop-processing-attempt + 1`, ack the original |
| 10th attempt fails | Dead-letter queue (waits 5 s, 10 s, 20 s … max 5 min ≈ 20 min in total) |
| Worker crashes mid-message | RabbitMQ redelivers it (unacked); dedupe keeps it safe |

Why re-publish instead of `nack(requeue)`: RabbitMQ 4 quorum queues don't count a
consumer's requeue towards `x-delivery-limit`, so a requeue loop would never stop.

Dead-lettered messages stay in `notifications.dead-letter` / `webhooks.dead-letter`
(RabbitMQ UI → Queues → Get messages) for inspection and manual replay.

## Writing a consumer

```ts
@Injectable()
export class MyConsumer implements ParcelEventConsumer {
  readonly queue = Queue.NOTIFICATIONS;
  readonly name = ConsumerName.NOTIFICATIONS;   // unique per consumer

  async handle(event: ParcelEventV1): Promise<void> {
    // Must be idempotent: the same event can arrive twice.
    // Throw PermanentFailure when a retry can never help.
  }
}
```

Register it in `worker.module.ts` (provider + the `PARCEL_EVENT_CONSUMERS` factory).

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | required | Postgres |
| `RABBITMQ_URL` | required | Broker |
| `RABBITMQ_EVENTS_EXCHANGE` | `parcel.events` | Exchange the queues bind to |
| `RABBITMQ_PREFETCH` | `10` | Unacked messages per consumer |
| `WORKER_RETRY_DELAY_MS` | `5000` | First retry wait (doubles each attempt) |
| `WORKER_HEALTH_PORT` | `4010` | Internal `GET /health` |

## Scaling

Run more replicas (`docker compose up -d --scale worker=2`): RabbitMQ spreads messages
between them (competing consumers). Idempotency makes that safe.
