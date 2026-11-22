# Customer tracking frontend: Stage A

Production still uses authenticated REST searches and retries. There is no
WebSocket/SSE connection, polling, new endpoint, or simulated production event.

## Status labels

Status codes from REST and recorded history events remain unchanged. Customer
Tracking and Delivery History use `STATUS_DETAILS` in `customerTrackingApi.ts`;
Dashboard cards and the details modal use `DELIVERY_STATUS_LABELS` in
`../context/customerDeliveryModel.ts`. Keep these friendly labels consistent:

| Persisted/API status | Display label |
| --- | --- |
| PENDING | Pending pickup |
| CREATED | Created |
| ASSIGNED | Assigned |

PENDING is no longer displayed as Created, and the Dashboard details modal uses
friendly labels instead of raw uppercase status codes. CREATED remains a
separate supported status. None of these pre-pickup statuses confirms pickup or
creates a timeline event; recorded event statuses and timestamps are preserved.

## Request lifecycle

`useCustomerRequest` retains its existing arguments and `data`, `error`,
`loading`, and `retry` outputs. It also exposes `refresh` and `refreshing`.
`retry` and `refresh` are the same stable callback within a request scope.

Customer Tracking opts into `keepPreviousDataOnRefresh` for its parcel and
summary. Background refresh keeps the last successful snapshot visible. Network
or unusable-response errors, HTTP 429, and server errors retain that snapshot
with an error message and retry action. HTTP 400/404 remove an invalid result;
401/403 clear it before session handling and block that scope from further reads.
The normal page access handler then redirects or hides all customer content.

Changing the loader (including the normalized tracking number), access handler,
or enabled state creates a new request scope immediately. Previous results are
not reused. Cleanup aborts pending work and rejects late responses even when the
loader ignores cancellation. React effect cleanup/setup can safely restart a
scope. There is at most one in-flight request and one queued follow-up per scope;
notifications during a read therefore do not lose a subsequent update or keep
aborting the current read. There are no automatic timer retries.

Retention defaults to false, preserving Delivery History's existing loading
behaviour. Receipt and public tracking code and REST response parsing are unchanged.

## Member 8 integration boundary

`CustomerTrackingUpdateSource` is a local TypeScript interface, not a transport
wire contract. A future adapter supplies `subscribe(parcelId, callback)` and
returns cleanup. Its normalized callback input contains only `parcelId` and an
optional opaque `notificationId` (1–256 characters). Duplicate identities are
remembered for the most recent 100 notifications per subscription.

`CustomerTrackingPage` accepts an optional `updates` source. The current route
supplies none, so production does not subscribe anywhere. When a real source is
provided, the hook subscribes only after REST returns an owned parcel, filters
notifications by its returned parcel ID, and invokes stable tracking and summary
refreshes. Notification contents never update statuses, dates, addresses, or
counts directly. Switching parcels or unmounting removes the subscription and
ignores late callbacks.

Stage B still requires Member 8's actual shared client, endpoint/protocol, payload
contract, authenticated ownership-scoped routing, and publication after database
commit. Agree on readiness/reconnection signals and replay/gap recovery before
enabling the source; perform a REST resynchronization when a subscription becomes
ready or reconnects. Connection/session failures also need the agreed shared
client handling. Account-wide notifications are needed if summary/history must
react to changes to other owned parcels. None of those transport responsibilities
or a live/connected UI indicator is implemented by Stage A.

## Focused checks

From the repository root, using Node with native TypeScript loading (verified
with the existing Node v24.12.0):

```sh
node --test apps/web/tests/*.test.mjs apps/web/tests/*.test.cjs
npm run lint:check -w apps/web
npm run build:web
```

The Node tests exercise the production request controller and notification
subscription function with isolated promises and test-only notifications.
They need no new dependencies or running API/database. They cover retention,
access failures, stale responses, cleanup/restarts, refresh coalescing, and
notification filtering/deduplication. They are not live browser/transport tests.

Label regressions also render the Customer Tracking badge/timeline, Delivery
History rows and Dashboard details modal. They distinguish PENDING from CREATED
and confirm that tracking/history parsers preserve the original API status codes
and recorded event timestamps. These checks use existing compiler and server
rendering dependencies without opening a Socket.IO connection.
