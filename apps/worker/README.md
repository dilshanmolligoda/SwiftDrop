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
| `NotificationConsumer` | `notifications.parcel-status` | Email (Mailpit in dev) / mock SMS, records the result | ✅ |
| `WebhookConsumer` | `webhooks.parcel-status` | Signed webhook to the merchant, backoff retries, dead-letter | ✅ |

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

## Customer notifications

The customer who booked the parcel hears about: booking confirmed, picked up, out for
delivery, delivered, delivery failed (with a plain-words reason) and returned
(`NOTIFY_STATUSES` changes the list). Events carry no personal data, so the worker looks
the customer up by parcel ID.

| Channel | Dev | Result |
|---|---|---|
| `EmailChannel` | SMTP to Mailpit — read them at <http://localhost:8025> | `SENT`; SMTP 5xx → `FAILED`; email off / no address → `SKIPPED` |
| `MockSmsChannel` | Logs the text with the number masked | `SENT`; no phone / `SMS_PROVIDER=none` → `SKIPPED` |

- One row per (event, channel, customer) in `notifications`. A temporary failure
  (mail server down, timeout) is retried with backoff; channels that already have a row
  are skipped, so nobody gets the same email twice.
- Emails contain the tracking number and status only, and link to the signed-in tracking
  page — the tracking number is never put in a URL. Logs mask emails and phone numbers.
- New channel (e.g. a real SMS provider): implement `NotificationChannel` and add it to
  the `NOTIFICATION_CHANNELS` factory in `worker.module.ts`.

## Merchant webhooks

One message = one delivery attempt; the attempt number travels in `x-swiftdrop-attempt`.
Every attempt is a row in `webhook_deliveries` (shown in the merchant dashboard).

| Merchant answers | Row status | Next |
|---|---|---|
| 2xx | `DELIVERED` | done |
| timeout, network error, 408, 429, 5xx | `RETRY_SCHEDULED` | parked in `webhooks.retry.{delay}ms`, back after 30 s · 2 m · 8 m · 32 m · ~2 h |
| same, on attempt `WEBHOOK_MAX_ATTEMPTS` | `DEAD_LETTERED` | copy in `webhooks.dead-letter` |
| other 4xx, invalid URL, private address | `FAILED` | not retried |

- **Signature:** `X-SwiftDrop-Signature: sha256=HMAC(secret, "<timestamp>.<body>")`, with
  `X-SwiftDrop-Timestamp`, `-Event-Id`, `-Event-Type`, `-Delivery-Attempt`. The secret is
  stored encrypted (`WEBHOOK_SECRET_ENCRYPTION_KEY`) and bound to its merchant.
- **SSRF protection:** the address actually connected to (after DNS) must be public, unless
  `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` (dev only) or the host is in
  `WEBHOOK_PRIVATE_HOST_ALLOWLIST` (e.g. `mock-merchant`). Redirects are not followed.
  Production requires `https://` except for allowlisted hosts.
- **Order:** retries can overtake later events; merchants use `sequence` to ignore older ones.
- **Demo:** turn on *Fail mode* in the mock merchant → attempts show `RETRY_SCHEDULED`;
  turn it off → the next attempt is `DELIVERED`.

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
| `WEBHOOK_SECRET_ENCRYPTION_KEY` | required in production | Decrypts merchant signing secrets (32 bytes, base64) |
| `WEBHOOK_TIMEOUT_MS` | `5000` | Per-attempt HTTP timeout |
| `WEBHOOK_MAX_ATTEMPTS` | `6` | Attempts before dead-lettering |
| `WEBHOOK_BACKOFF_BASE_MS` | `30000` | First retry delay, ×4 each time |
| `WEBHOOK_ALLOW_PRIVATE_TARGETS` | `false` | Dev only: allow private addresses |
| `WEBHOOK_PRIVATE_HOST_ALLOWLIST` | — | Comma-separated hosts allowed on private networks |
| `NOTIFY_EMAIL_ENABLED` | `true` | Send customer emails |
| `SMTP_HOST` / `SMTP_PORT` | `localhost` / `1025` | Mail server (required in production unless email is off) |
| `SMTP_USER` / `SMTP_PASSWORD` | — | Only if the server needs login |
| `SMTP_FROM` | `SwiftDrop <no-reply@swiftdrop.local>` | Sender |
| `SMS_PROVIDER` | `mock` | `mock` or `none` |
| `NOTIFY_STATUSES` | picked up, out for delivery, delivered, failed, returned | Comma-separated `ParcelStatus` values |
| `WEB_APP_URL` | `http://localhost:5173` | Link in emails |

## Scaling

Run more replicas (`docker compose up -d --scale worker=2`): RabbitMQ spreads messages
between them (competing consumers). Idempotency makes that safe.
