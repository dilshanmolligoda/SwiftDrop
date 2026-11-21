# Recording parcel events (transactional outbox)

When your code changes a parcel's status, record an event **in the same Prisma
transaction**. Notifications, merchant webhooks and live updates all start from it.

```ts
// your.module.ts
@Module({ imports: [OutboxModule], ... })

// your.service.ts
constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxWriter) {}

await this.prisma.$transaction(async (tx) => {
  await tx.parcel.updateMany({ where: { id, status: previous }, data: { status: next } });
  await this.outbox.recordParcelStatusChanged(tx, {
    parcel,                    // needs id, trackingNumber, merchantOrderId
    previousStatus: previous,
    newStatus: next,
    failureReason,             // only kept for FAILED
    courierId,                 // assigned courier, if any
  });
});
```

For a new parcel use `recordParcelCreated(tx, { parcel, status })`.

**Rules**

- Use the `tx` you got from `$transaction`, never `this.prisma`. Otherwise an event can
  exist for a change that rolled back.
- Don't publish to RabbitMQ yourself. `OutboxRelay` (in `infrastructure/messaging`)
  publishes the rows in order, retries while RabbitMQ is down, and marks them published.
- Events contain IDs and statuses only. Never add names, phones, addresses or emails.

**Where it's called today:** `courier.service.ts` → `transitionStatus()`.
Still to add: parcel creation (parcels module), courier assignment (dispatch).

**Check it's working:** `GET /api/v1/health` shows `checks.messaging` and
`outbox.pending` (events not yet published). RabbitMQ UI: <http://localhost:15672>,
queues `notifications.parcel-status` and `webhooks.parcel-status`.
