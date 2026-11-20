# Member 3 tracking and history

TrackingModule is registered in AppModule and exposes four private REST APIs and
one public tracking API. Its private reader calls Member 2's exported
ParcelsService. The public reader uses a separate minimal Prisma SELECT. No Prisma
schema, migration, pricing, authentication, or courier implementation changed.
The receipt API reuses the pdf-lib foundation. Real-time endpoints remain unregistered.

## Registered APIs

Paths include the default /api/v1 prefix:

| Method/path                            | Response                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| GET /customer/tracking/:trackingNumber | Owned parcel status, addresses, dates, and recorded history                    |
| GET /customer/deliveries               | Filtered/paginated items, page, pageSize, total                                |
| GET /customer/deliveries/summary       | activeDeliveries, deliveredThisMonth, needsAttention, reportingMonth, timeZone |
| GET /tracking/:trackingNumber         | Public status and recorded event dates for secure tracking identifiers       |
| GET /customer/deliveries/:parcelId/receipt | Owned booking-charge receipt as a private PDF download                    |

Existing /parcels/me still returns its original array. Existing /parcels/metrics,
/parcels/:id, creation, and pricing routes remain unchanged. Do not replace them
with these new response contracts.

## Secure public tracking

The previous SD-five-digit generator had only 90,000 possible values and is not
safe for anonymous discovery. New customer bookings now use the existing
trackingNumber field with SD- followed by 32 uppercase hex characters, generated
by node:crypto randomBytes(16) (128 random bits). This is the only production
change to Member 2's parcel creation service. Request DTOs, response field names,
ownership, pricing, persistence, and booking events retain their existing contracts.
The creation test now asserts the new format. Coordinate the longer displayed
identifier with Member 2 and any external consumers; do not truncate it.

Existing numbers are not rewritten. Authenticated tracking/history continue to
accept them. PublicTrackingService and PublicParcelReaderAdapter independently
reject every legacy/seed/browser-fallback format before querying persistence,
using the same 404 Parcel not found response as an unknown secure identifier.
Malformed input returns 400. Input is trimmed and uppercased, with the existing
64-character transport bounds. Knowing a secure number grants access to its
limited public tracking data; protect and share it accordingly.

The response allowlist is trackingNumber, status, optional updatedAt, and history
entries containing only status and occurredAt. The indexed exact Prisma lookup
selects no account IDs, names, contacts, addresses, charges, locations, private
notes, actor/proof metadata, or failure reasons. It reads both ParcelStatusHistory
and courier ParcelStatusEvent, orders actual events chronologically, and retains
repeated events. A current status or updatedAt never creates an inferred event.
All nine Prisma statuses pass through unchanged. The private adapter is unchanged.

The public action uses the existing @Public decorator, with its own singleton
rate-limit guard. Private controllers retain their customer/ownership checks.
The guard allows 20 requests per direct socket peer per 60 seconds and 600 total
per process per 60 seconds, including malformed and legacy requests. It ignores
forwarded address headers, bounds address storage at 10,000 entries, and returns
429 with Retry-After when limited. All public lookup responses have Cache-Control:
no-store and Referrer-Policy: no-referrer, including validation and error responses.

Limits are process-local and reset on restart. Deploy shared edge/distributed
limits before using multiple replicas; behind a reverse proxy the direct peer
quota is shared by its visitors. Do not trust arbitrary X-Forwarded-For headers.
Serve this API over HTTPS and redact tracking identifiers from reverse-proxy,
access, error, and analytics logs. The page does not store them in browser storage
or URL query parameters and sends anonymous requests with no-store/no-referrer.
There is no public search/list API or automatic conversion of legacy identifiers.

At /track, use a newly issued secure identifier to view status and recorded events
without signing in. Legacy-number guidance links to /customer/tracking instead.
The page preserves the existing SwiftDrop card, supports retry/429 cooldown, and
aborts stale or unmounted requests. No production demo parcels are created.

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
| CREATED          | active         | no              |
| ASSIGNED         | active         | no              |
| PENDING          | active         | no              |
| PICKED_UP        | active         | no              |
| IN_TRANSIT       | active         | no              |
| OUT_FOR_DELIVERY | active         | no              |
| DELIVERED        | delivered      | no              |
| FAILED           | failed         | yes             |
| RETURNED         | other-terminal | yes             |

History includes all terminal categories. RETURNED remains distinct from FAILED.
PENDING is never renamed CREATED, and MerchantOrder statuses are not substituted.
CREATED and ASSIGNED also pass through unchanged. Assignment does not establish
pickup; only an included recorded event can establish a timeline timestamp.
Unknown statuses fail explicitly. Attention classification is separate from the
terminal outcome classification.

Summary calculations cover the full owned snapshot, independent of history
filters/pages. They use UTC calendar-month semantics:
active counts all six active statuses; delivered-this-month counts only DELIVERED
with a usable deliveredAt in the current UTC year/month; attention counts FAILED
and RETURNED. Missing delivery dates do not count as confirmed monthly deliveries.
This replaces Phase 1's provisional Colombo-month/nullable monthly count.
The response includes reportingMonth (YYYY-MM) and timeZone UTC. The internal now
argument is a test seam, never a request parameter. Receipt PDF display dates
retain their separate existing Sri Lanka-time behavior.

The incoming courier service writes ParcelStatusEvent, while Member 2's exported
customer query currently includes only ParcelStatusHistory. This adapter cannot
read courier-only events through that contract and does not manufacture them from
the current status or updatedAt. The courier completion writer also does not set
deliveredAt, so those records cannot contribute to confirmed monthly deliveries
until the writers/readers agree on the authoritative event and delivery-date
contract. Member 2's separate /parcels/metrics still counts only four active
statuses; it needs coordinated alignment rather than a change to this API.

## Scalability limitation

The approved initial tracking lookup loads only the authenticated customer's
complete list and filters it in memory. History filtering/pagination and summaries
also use that complete snapshot. This is database-backed, but is not a dedicated
indexed lookup or database-side pagination. Member 2 must later export an indexed
customerId+trackingNumber query and coordinated storage-side filtering/counting/
aggregation contracts for scale. Do not supply a single page to the complete-list
port, and never work around the limit with an unscoped parcel query.

## Receipts and deferred integrations

The [receipt API](receipts/README.md) is registered at
GET /customer/deliveries/:parcelId/receipt. It reuses the pdf-lib foundation with
an ownership-scoped Prisma reader. All valid owned bookings can produce a
recorded-charge receipt, independent of delivery status, without asserting payment.
The stored parcel UUID is labeled Parcel reference; there is no invented receipt
number. See the receipt documentation for exact Decimal conversion, safe headers,
field mapping, unavailable/font limitations, and manual download checks.

The old proposed /parcels/:parcelId/receipt alias is not registered. No RabbitMQ,
SSE, WebSocket, or courier status writer was added. Member 8 owns later transport
integration; GET /tracking/:trackingNumber/stream remains unregistered.

## Frontend integration

Member 3's customer tracking and history pages consume these API projections with
cookie credentials. Their typed response parser supports all nine Prisma statuses.
PENDING displays as Created, CREATED displays as Created, and ASSIGNED displays as
Assigned without changing the API codes or implying a recorded pickup. Timeline
confirmations and timestamps require real history events. No ownership IDs are
invented in responses or supplied by the client to select another customer's data.
MyDeliveriesPage at /deliveries and DeliveryHistoryPage at /customer/deliveries
still overlap; no route/navigation consolidation was performed.

## Verification

From the repository root:

```sh
npm run test -w apps/api -- --runInBand --watch=false --testPathPatterns=modules/tracking
npm run test -w apps/api -- --runInBand --watch=false --testPathPatterns=modules/parcels
npm run build -w apps/api
npm run build:web
npm run lint:check -w apps/web
```

Run installed ESLint against src/modules/tracking/**/*.ts from apps/api without
--fix, and use Prettier --check. All fixtures are in *.spec.ts files, excluded from
production builds. HTTP integration tests import the real TrackingModule, reader,
controllers, validation pipes, and global guard classes, but override
ParcelsService/PrismaService and user storage. They open temporary localhost
sockets and never connect to PostgreSQL. They also confirm /parcels/me keeps its
array response and deferred endpoints remain absent. Passing these tests is not
live database or browser verification.
