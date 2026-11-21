# packages/contracts — Shared contracts

Types and constants shared by `api`, `worker`, `web` and `tools/mock-merchant`, so every
app agrees on the same message shapes and queue names.

```text
src/
├── enums/       ParcelStatus, DeliveryFailureReason, Role (mirror the Prisma enums)
├── events/      ParcelCreatedV1, ParcelStatusChangedV1 + parseParcelEvent()
├── messaging/   RabbitMQ exchange, queue, routing-key and header names
├── webhooks/    MerchantWebhookPayloadV1, WEBHOOK_HEADERS, toMerchantWebhookPayload()
└── realtime/    WebSocket path, event names, rooms, update payloads
```

## Use it

Add `"@swiftdrop/contracts": "*"` to your app's `dependencies`, then:

```ts
import { ParcelEventType, parseParcelEvent, Queue } from '@swiftdrop/contracts';
```

The package ships ES modules (web, worker) and CommonJS (api, Jest). **Build it before
starting an app that uses it:**

```bash
npm run build -w packages/contracts
npm test -w packages/contracts
```

The Dockerfiles already build it first.

## Event flow

```text
status change (DB transaction) → outbox_events row → relay → RabbitMQ parcel.events
   ├─ notifications.parcel-status → worker → email / mock SMS
   ├─ webhooks.parcel-status      → worker → signed POST to merchant (retry → DLQ)
   └─ realtime.{apiInstance}      → api WebSocket gateway → browser rooms
```

## The event

```ts
// routing key = eventType = 'parcel.status.changed'
interface ParcelStatusChangedV1 {
  eventId: string;            // UUID — consumers dedupe on this
  eventType: 'parcel.status.changed';
  version: 1;
  occurredAt: string;         // ISO-8601 UTC
  parcelId: string;
  trackingNumber: string;
  merchantId: string | null;  // merchant user ID; null = customer parcel → no webhook
  courierId: string | null;   // assigned courier, for real-time routing
  sequence: number;           // increases per parcel; drop lower ones
  previousStatus: ParcelStatus;
  newStatus: ParcelStatus;
  failureReason: DeliveryFailureReason | null; // only when newStatus = FAILED
}
```

`ParcelCreatedV1` has the same base fields plus `status`.

**No personal data** (names, phones, addresses, emails) goes into events, webhooks or
real-time messages. Consumers look up what they need by ID.

## Merchant webhook

`POST {merchant URL}` with `MerchantWebhookPayloadV1` and these headers:

| Header | Value |
|---|---|
| `X-SwiftDrop-Event-Id` | Same for every retry — dedupe on it |
| `X-SwiftDrop-Event-Type` | `parcel.created` / `parcel.status.changed` |
| `X-SwiftDrop-Timestamp` | Unix seconds |
| `X-SwiftDrop-Signature` | `sha256=` + hex HMAC-SHA256 of `<timestamp>.<raw body>` with the merchant's secret |
| `X-SwiftDrop-Delivery-Attempt` | 1, 2, 3 … |

Reject requests more than 300 s old. Retries can arrive out of order, so ignore a webhook
whose `sequence` is lower than one already processed for that tracking number.

## Rules for changing contracts

Changing a contract can break other people's code, and the webhook payload is used by
**external** merchant systems.

- Never rename or remove a field. Add an optional field, or create a `...V2` type.
- When a Prisma enum changes, update `src/enums` in the same PR.
- Announce contract changes in the team chat and tag the affected owners in the PR.
