# Member 3 private tracking and history — Phase 2

TrackingModule is registered in AppModule and exposes three private REST APIs.
Its real reader calls Member 2's exported ParcelsService; no Prisma schema,
repository, parcel controller, pricing, authentication, or frontend code changes
are needed. There is no public tracking, receipt-download, or real-time endpoint.

## Registered APIs

Paths include the default /api/v1 prefix:

| Method/path                            | Response                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| GET /customer/tracking/:trackingNumber | Owned parcel status, addresses, dates, and recorded history                    |
| GET /customer/deliveries               | Filtered/paginated items, page, pageSize, total                                |
| GET /customer/deliveries/summary       | activeDeliveries, deliveredThisMonth, needsAttention, reportingMonth, timeZone |

Existing /parcels/me still returns its original array. Existing /parcels/metrics,
/parcels/:id, creation, and pricing routes remain unchanged. Do not replace them
with these new response contracts.

## Authorization and ownership

Both new controllers declare @Roles(Role.CUSTOMER), consume @CurrentUser(), and
use the existing application-global CSRF/JWT/Approval/Role guards. Authentication
can use the established HttpOnly cookie or Bearer mechanism. Approval and account
activity are checked against the live user by ApprovalGuard; the role guard uses
the existing JWT claim. No auth/guard implementation was changed.

No client-supplied customer ID controls a query. Tracking ignores unrelated query
parameters; history rejects unexpected fields such as customerId through the
ValidationPipe/DTO whitelist. Service entry points validate identities and role
again, but do not establish sessions or replace the global approval guard.

ParcelsReaderAdapter calls listForCustomer(authenticatedCustomerId), whose existing
repository query enforces ownership. The adapter and services also verify returned
ownership. Single-record missing/other-owned/mismatched results all return
404 Parcel not found; a mixed-owner collection fails closed. Reader failures do
not become invented empty accounts.

## Real record mapping

CustomerParcelReader is the private injection boundary bound to
ParcelsReaderAdapter. The adapter talks only to ParcelsService, not its repository,
PrismaService, merchant storage, or browser data. It maps:

- id, customerId, trackingNumber, and unchanged PostgreSQL status;
- senderAddress to private origin and recipientAddress to private destination;
- createdAt/updatedAt/deliveredAt Date objects to ISO strings (null delivery date
  becomes omitted);
- statusHistory status/createdAt to history status/occurredAt, sorted by timestamp
  and stable event ID, without changing the source collection.

Missing history inclusion or invalid Date values fail rather than inventing
history/timestamps. An actually empty included history remains empty. Free-text
notes, locations, failure reasons, names, contact numbers, fees, and owner IDs are
not included in the tracking/history response projections. Private tracking
includes the real owned addresses. No stages are inferred from current status.

## Query and summary definitions

History query defaults: filter=all, search empty, page=1, pageSize=5.
Allowed filters are all, active, history. Search matches tracking numbers only,
is case-insensitive, trims outside whitespace, and is bounded to 64 characters.
Page is 1–1,000,000 and pageSize is 1–100. Unexpected fields, duplicate scalar
parameters, invalid enum values, and invalid numeric forms are rejected.
Filtering/searching run before pagination. Ordering is createdAt descending then
parcel ID descending. Out-of-range pages return empty items and the requested
page with the accurate total. No page clamping occurs.

PrismaParcelStatusPolicy explicitly preserves the stored statuses:

| Stored status    | Category       | Needs attention |
| ---------------- | -------------- | --------------- |
| PENDING          | active         | no              |
| PICKED_UP        | active         | no              |
| IN_TRANSIT       | active         | no              |
| OUT_FOR_DELIVERY | active         | no              |
| DELIVERED        | delivered      | no              |
| FAILED           | failed         | yes             |
| RETURNED         | other-terminal | yes             |

History includes all terminal categories. RETURNED remains distinct from FAILED.
PENDING is never renamed CREATED, and MerchantOrder statuses are not substituted.
Unknown statuses fail explicitly. Attention classification is separate from the
terminal outcome classification.

Summary calculations cover the full owned snapshot, independent of history
filters/pages. They align with Member 2's existing UTC calendar-month semantics:
active counts the four active statuses; delivered-this-month counts only DELIVERED
with a usable deliveredAt in the current UTC year/month; attention counts FAILED
and RETURNED. Missing delivery dates do not count as confirmed monthly deliveries.
This replaces Phase 1's provisional Colombo-month/nullable monthly count.
The response includes reportingMonth (YYYY-MM) and timeZone UTC. The internal now
argument is a test seam, never a request parameter. Receipt PDF display dates
retain their separate existing Sri Lanka-time behavior.

## Scalability limitation

The approved initial tracking lookup loads only the authenticated customer's
complete list and filters it in memory. History filtering/pagination and summaries
also use that complete snapshot. This is database-backed, but is not a dedicated
indexed lookup or database-side pagination. Member 2 must later export an indexed
customerId+trackingNumber query and coordinated storage-side filtering/counting/
aggregation contracts for scale. Do not supply a single page to the complete-list
port, and never work around the limit with an unscoped parcel query.

## Preserved but not registered

PublicParcelReader is separate from CustomerParcelReader. The Phase 1 public
projection/business logic now lives in PublicTrackingService, which is NOT a
TrackingModule provider and has no public adapter/controller. This avoids a
throwing placeholder public method on the real private adapter. Its existing
privacy/normalization tests remain in tracking.service.spec.ts.

The [receipt foundation](receipts/README.md) and all its source/tests are unchanged.
It has no registered reader/controller or HTTP download. The earlier receipt
foundation document records its original stage; actual parcel persistence now
exists, but receipt reference/currency/eligibility/snapshot integration still
requires agreement. No new PDF dependency or font was installed in this phase.

Future-only paths include /tracking/:trackingNumber,
/parcels/:parcelId/receipt, and /tracking/:trackingNumber/stream. No RabbitMQ, SSE,
WebSocket, courier status writer, public tracking, or receipt download was added.
Member 6 still supplies authoritative future status updates; Member 8 owns later
event/outbox/transport integration.

## Frontend integration remains separate

No frontend file changed. Existing tracking UI expects stage/timestamp and uses
CREATED rather than PENDING; history UI expects an owner ID for a local defensive
filter while these projections omit it. Those explicit response/presentation
mappings and RETURNED support must be agreed when connecting the pages.
MyDeliveriesPage at /deliveries and DeliveryHistoryPage at /customer/deliveries
still overlap; no route/navigation consolidation was performed.

## Verification

From the repository root:

```sh
npm run test -w apps/api -- --runInBand --watch=false --testPathPatterns=modules/tracking
npm run build -w apps/api
```

Run installed ESLint against src/modules/tracking/**/*.ts from apps/api without
--fix, and use Prettier --check. All fixtures are in *.spec.ts files, excluded from
production builds. HTTP integration tests import the real TrackingModule, reader,
controllers, validation pipes, and global guard classes, but override
ParcelsService/PrismaService and user storage. They open temporary localhost
sockets and never connect to PostgreSQL. They also confirm /parcels/me keeps its
array response and deferred endpoints remain absent. Passing these tests is not
live database or browser verification.
