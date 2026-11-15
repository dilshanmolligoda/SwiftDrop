# Member 3 tracking/history foundation — Phase 1

This directory contains independently testable read-side business logic. It is
**not a working tracking API**. Nothing is registered in `AppModule`; there are no
HTTP controllers, database adapters, default data, status mappings, PDF generator,
or real-time connections. Existing application behavior is unchanged.

## Implemented components

- `TrackingService`: normalized public lookup and authenticated-customer lookup.
  Missing and other-owned private parcels both produce `404 Parcel not found`.
- `DeliveryHistoryService`: customer-scoped snapshots, All/Active/History filters,
  trimmed case-insensitive tracking-number search, stable creation-date/ID ordering,
  pagination, and customer summary calculations.
- Explicit response projections omit source-only fields and internal event notes.
  Public results include only tracking number, status, optional update timestamp,
  and recorded status/timestamp pairs. No synthetic timeline events are created.
- DTOs match the installed Nest `ValidationPipe` conventions. Service entry points
  also validate inputs, including unexpected query fields such as `customerId`.
- Two required abstract classes serve as Nest injection tokens: `ParcelReader`
  and `ParcelStatusPolicy`. Tests bind isolated mocks with `useValue`; application
  code supplies no fake implementation or fallback for either dependency.

## Required integration boundaries

`ParcelReader` must be bound to Member 2's future exported persistent parcel query
service, through a real adapter owned/agreed by the team. Do not query the merchant
repository or import browser-local records. The reader returns `ParcelReadRecord`
objects with canonical uppercase tracking numbers, opaque machine status codes,
valid ISO-8601 timestamps with offsets, and real append-only event history.
Status fields must never contain names, addresses, notes, or other free text.

The adapter must enforce customer ownership in storage queries using the supplied
authenticated customer ID. Services verify it again: mismatched single records
produce 404; mixed-owner list snapshots fail closed rather than leaking records
or reporting incorrect totals. Storage errors propagate; they are not converted
into empty accounts. The source may have additional private fields, but response
projections must continue to copy only the explicit allowlist.

`listCustomerParcels` currently requires a complete, consistent customer snapshot.
History filtering and pagination happen in memory and summaries cover that whole
snapshot. Do not implement this port with only one database page. Before enabling
production use at scale, agree a storage-side filter/count/pagination/aggregation
port and consistency guarantees. Never expose an unbounded full-snapshot HTTP
endpoint as a workaround.

## Unresolved status and input contracts

No customer status enum has been agreed. `ParcelStatusPolicy.classify` must map
each agreed source status to a query category: `active`, `delivered`, `failed`, or
`other-terminal`. These are read-side categories, not a new canonical state
machine. There is no default mapping from MerchantOrder or frontend statuses.
The real policy must reject unrecognized codes; services also reject invalid
classification results. Any additional terminal-state and attention rules need
explicit team agreement. Currently History means all terminal categories, and
Needs attention means the confirmed `failed` category only.

Transport validation currently accepts 1–64 ASCII letters/digits with separating
hyphens, trims outer whitespace, and uppercases tracking numbers. It does not
require an `SD` prefix. These provisional transport bounds must be confirmed with
the tracking-number generator owner before endpoints are enabled.

History query fields: `filter=all|active|history`, `search` (trimmed/uppercased,
maximum 64 characters), `page` (1–1,000,000), `pageSize` (1–100, default 5).
Pagination applies after filtering/searching; out-of-range pages return empty
items with the original requested page and accurate total. No page clamping is
performed. The full customer summary is independent of history filters/pages.

Delivered-this-month uses the confirmed delivered category and `deliveredAt`,
never `createdAt` or `updatedAt`. Calendar month and year use `Asia/Colombo`;
timestamps remain source ISO values in projections. If any delivered parcel lacks
a usable delivery date, the monthly count is `null` rather than an invented zero.
An empty confirmed snapshot yields zero counts. The summary's `now` argument is
an internal clock/test seam, not an eventual client query parameter.

## Authentication requirements before registering routes

Future private controllers must use existing global `JwtAuthGuard`,
`ApprovalGuard`, and `RolesGuard`, plus `@Roles(Role.CUSTOMER)` and
`@CurrentUser()`. Pass the authenticated identity to service methods, never an
identity or customer ID copied from request bodies/query parameters. The small
`requireCustomer` helper checks presence/role but does not authenticate a session
or replace the live database approval guard. It deliberately does not trust stale
JWT approval claims. Immediate role-change behavior should be agreed with the
authentication owner because the existing role guard uses the JWT role claim.

Keep the public controller separate and apply `@Public()` without inherited
customer-role metadata. Add agreed public rate limiting and privacy review before
exposing tracking. No auth files or shared guards need to change for Phase 1.

## Proposed endpoints — none registered

All paths below include the default `/api/v1` prefix and still require agreement
with the parcels owner to avoid duplicate route ownership:

| Method/path                              | Proposed use                                               |
| ---------------------------------------- | ---------------------------------------------------------- |
| `GET /tracking/:trackingNumber`          | Public, restricted tracking response                       |
| `GET /customer/tracking/:trackingNumber` | Authenticated customer-owned tracking                      |
| `GET /parcels/me`                        | Authenticated customer history with the query fields above |
| `GET /parcels/me/summary`                | Complete customer summary                                  |
| `GET /parcels/:parcelId/receipt`         | Future owner-authorized PDF download                       |
| `GET /tracking/:trackingNumber/stream`   | Later public-safe SSE, coordinated with Member 8           |

Response shapes here are Phase 1 view models, not published shared API contracts.
The existing frontend tracking timeline uses `stage`/`timestamp`; this foundation
uses source `status`/`occurredAt`. The history frontend currently expects an owner
ID for its local defensive filter, while these projected items omit that field.
Agree the final response/adapter shape before wiring either page. Do not silently
rename the other members' types. No frontend page is connected by this phase.

## Dependencies outside Member 3

- **Member 2 / schema owner:** persisted customer parcels and ownership, unique
  tracking numbers, canonical statuses/timestamps, recorded booking fees, and an
  exported read service. Schema/migrations/client generation remain separate,
  coordinated work. Existing MerchantOrder persistence is not customer storage.
- **Member 6:** real confirmed status history, transition rules, failure states,
  delivery timestamps, and proof references. Do not reconstruct history from a
  current status or create a parallel status writer here.
- **Member 8:** event schema/versioning, transactional outbox and RabbitMQ
  publication, deduplication/ordering, and the agreed SSE/real-time integration.
  REST read logic does not depend on a fake broker or simulated updates.
- **Receipts (later phase):** agreed eligibility, authoritative fee/currency and
  booking snapshot, approved PDF renderer/dependency, and an ownership check before
  generating bytes. No receipt service/endpoint is implemented in Phase 1. Future
  downloads should be attachments with private/no-store caching and no public
  filesystem paths or URLs.

## Isolated verification

From the repository root:

```sh
npm run test -w apps/api -- --runInBand --watch=false --runTestsByPath src/modules/tracking/dto/tracking-validation.spec.ts src/modules/tracking/services/tracking.service.spec.ts src/modules/tracking/services/delivery-history.service.spec.ts
npm run build -w apps/api
```

For lint checks, run the installed ESLint from `apps/api` against
`src/modules/tracking/**/*.ts` without `--fix`. The API's generic `lint` script
auto-fixes files and should not be used for an isolated read-only lint check.
All sample records/status policies live in `*.spec.ts` files, excluded from the
production build. Unit tests do not contact a database, authenticate real browser
sessions, or establish working production endpoints.
