# apps/worker — Event consumers (NestJS standalone)

Separate process that consumes `ParcelStatusChanged` events from RabbitMQ. Runs in its own
container, so a slow email server or a broken merchant endpoint never slows down the API.

## Consumers

| Consumer | Queue | Does |
|---|---|---|
| Notification consumer | `notifications.parcel-status` | Sends email (Mailpit in dev) or mock SMS, records the result |
| Webhook consumer | `webhooks.parcel-status` | Sends signed webhook to the merchant, retries with backoff, dead-letters after the limit |

## Planned layout

```text
apps/worker/src/
├── main.ts
├── consumers/
│   ├── notification.consumer.ts
│   └── webhook.consumer.ts
├── notifications/
│   ├── channels/        # EmailChannel, MockSmsChannel (Strategy/Adapter)
│   └── templates/
├── webhooks/
│   ├── signer.ts        # HMAC-SHA256 signature
│   └── retry-policy.ts  # exponential backoff
└── idempotency/         # processed-event store (dedupe by eventId)
```

Every consumer must be **idempotent**: RabbitMQ can deliver the same message twice.
