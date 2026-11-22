# Dashboard delivery state

`CustomerLayout` verifies `/auth/me` before handing an active, approved CUSTOMER
identity to `CustomerDeliveryProvider`. Profile data, browser storage and request
inputs never establish that identity. Leaving the layout, logout, a verified
account change, or HTTP 401/403 clears delivery state and invalidates outstanding
reads/writes. A list containing another owner's records also fails closed.

`customerDeliveryStore.ts` keeps a memory snapshot for that verified session. It
never restores or saves private delivery data in localStorage; the old unscoped
`swiftdrop_customer_deliveries_v5` entry is removed. A normal authenticated reload
always reads the server. Temporary failures can retain the same owner's last
successful snapshot with a visible error and retry action.

Reads use the existing cookie-authenticated `GET /parcels/me` and
`GET /customer/deliveries/summary` APIs (under the configured API base URL).
The tracking summary preserves the existing UTC reporting month and completion
dates derived from recorded courier events. The local metrics fallback counts
only an actual `deliveredAt` in that UTC month; it does not invent dates.

Refreshes are serialized, with one follow-up read coalescing notifications/actions
received during a pending read. Scope identity and a write revision prevent old
responses overwriting a new account, a logged-out session or a newer creation.
Create Delivery's POST path, credentials and payload are unchanged. Its existing
offline simulation remains memory-only and cannot be inserted after access is
revoked or the verified account changes. No Create Delivery UI is moved.

The Dashboard recognizes all nine persisted parcel statuses. CREATED, ASSIGNED
and PENDING do not confirm pickup. Details are selected by ID from current
provider state, so an open dialog follows a refreshed record and disappears when
that record is cleared. Manual Track and error retry also refresh the provider.

## Real-time dependency on Member 8

The Dashboard is **not subscribed** and does not claim to be live. The shared
Socket.IO contract currently supports individual parcel rooms; there is no
customer-wide notification scope. Its 20-room / 30-subscriptions-per-minute limits
make subscribing to every delivery an incomplete Dashboard solution.

Member 8 must provide an authenticated, ownership-enforced customer-wide
invalidation contract and shared-client integration covering all owned parcels,
including newly created parcels. Agree on its payload/sequence semantics,
authorization failure handling, session changes and reconnection behavior. Once
available, use the existing shared client to trigger `refreshDeliveries()`;
re-read REST state on reconnect because events are not replayed. Do not create a
second client, invent room/event names, or alter Stage A's parcel-scoped tracking.

Until then, courier changes appear on a fresh authenticated reload or manual
Track/retry, not automatically on an idle Dashboard. Existing Customer Tracking,
Delivery History, public tracking and receipt code is unchanged. The separate
Member 2 `/deliveries` page's legacy filters are outside this Dashboard patch.

## Regression checks

From the repository root with the existing Node TypeScript support:

```sh
node --test apps/web/tests/*.test.mjs apps/web/tests/*.test.cjs
npm run lint:check -w apps/web
npx tsc -b apps/web
```

The new tests use deferred HTTP and controlled component hooks/server rendering.
They cover status presentation, current modal records, verified identity, request
races, access cleanup and preservation of the creation POST. They are isolated
regressions, not browser or courier-to-Socket.IO end-to-end tests.
