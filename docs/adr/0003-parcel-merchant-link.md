# ADR 0003 — Link merchant orders to parcels

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

Merchant webhooks are sent when a parcel's status changes, so the webhook worker must
know which merchant a parcel belongs to. Today it can't:

- `Parcel` has `customerId` but no merchant reference.
- `MerchantOrder` is a separate table with its own `status` and `trackingNumber`, no
  foreign key to `Parcel`, and nothing updates its status after creation.
- Couriers change `Parcel.status` (`courier.service.ts`), so merchant order status never
  moves.

## Decision

Add a nullable link from `Parcel` to its merchant order:

```prisma
model Parcel {
  // …
  merchantOrderId String?        @unique @db.Uuid
  merchantOrder   MerchantOrder? @relation(fields: [merchantOrderId], references: [id], onDelete: SetNull)
}
```

- The merchant order API creates the `Parcel` and the `MerchantOrder` in one transaction
  and sets the link.
- `Parcel.status` is the **single source of truth**. The merchant dashboard reads status
  through the link (or maps `ParcelStatus` → `MerchantOrderStatus` when showing it),
  instead of a second status column that can drift.
- Events carry `merchantId` (the merchant user ID) taken from the linked order; `null`
  means a customer parcel and no webhook.

**Fallback** if the schema change can't land soon: the worker finds the merchant order by
`trackingNumber` (unique in both tables). This works for demo data, but nothing in the
database guarantees the two rows refer to the same delivery.

## Consequences

- ✅ Webhooks, notifications and the merchant dashboard all follow the real parcel status.
- ✅ One status column, with one state machine guarding it.
- ⚠️ Migration touches `parcels` (owned by the parcels module) — coordinate the PR.
- ⚠️ `MerchantOrder.status` becomes redundant; the merchant dashboard owner decides
  whether to drop it or keep it as a cached projection.
