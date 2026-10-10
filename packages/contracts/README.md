# packages/contracts — Shared types

TypeScript types shared by `web`, `api`, `worker` and `ai-assistant`, so they all agree on
the same shapes.

```text
packages/contracts/src/
├── enums/      # ParcelStatus, Role, ParcelSize, MerchantStatus
├── events/     # ParcelStatusChangedV1 (message broker payload)
├── webhooks/   # merchant webhook payload
└── api/        # request/response types used by the web client
```

Example event contract:

```ts
export interface ParcelStatusChangedV1 {
  eventId: string;            // UUID — consumers dedupe on this
  eventType: 'parcel.status.changed';
  version: 1;
  occurredAt: string;         // ISO-8601
  parcelId: string;
  trackingNumber: string;
  merchantId: string | null;  // null = customer parcel → no webhook
  previousStatus: ParcelStatus;
  newStatus: ParcelStatus;
  failureReason?: string;
}
```

**Rule:** changing a contract can break other people's code. Never rename or remove a
field — add a new optional field, or create `...V2`. Announce contract changes in the team
chat and tag the affected owners in the PR.
