# Authenticated PDF delivery receipts

The existing `pdf-lib` foundation now generates PDF downloads from real stored
customer parcels. `TrackingModule` binds the ownership-scoped `ReceiptPrismaReader`,
`ReceiptService`, `ReceiptPdfService`, and `CustomerReceiptController`. No schema,
migration, parcel creation, merchant PDFKit, authentication, or public tracking
implementation is changed. No sample receipt is loaded into application data.

## Download API

`GET /api/v1/customer/deliveries/:parcelId/receipt`

Use the existing authenticated customer session cookie (Bearer clients also work).
Global JWT, live approval/account, and role guards apply; the controller declares
`@Roles(Role.CUSTOMER)` and has no `@Public` decorator. The UUID is a parcel ID,
not a tracking number. Both secure and legacy tracking numbers work because the
reader uses the owner's persisted parcel ID. No receipt body/amount/customer ID
is accepted; unrelated query parameters cannot override any stored value.

Success returns the actual PDF bytes with `Content-Type: application/pdf`,
`Content-Disposition: attachment; filename="swiftdrop-receipt-<trackingNumber>.pdf"`,
`Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and
`Referrer-Policy: no-referrer`. Content-Disposition is exposed to the browser for
cross-origin downloads. The filename uses only a normalized bounded alphanumeric
tracking identifier and separating hyphens. PDFs are generated in memory, never
published at a public/static URL or written to shared disk.

Missing authentication returns 401; wrong role or unapproved accounts return 403;
malformed parcel IDs return 400; missing and other-owned parcels both return 404
Receipt not found. Invalid stored required fields and unsupported font glyphs
return a generic 503 receipt-unavailable response without private values. Other
unexpected persistence/render failures return the standard generic 500 response.
No PDF filename/Content-Type is applied until a receipt is successfully generated.

## Components and trust boundary

- `receipt.types.ts`: authoritative receipt data, owner/parcel envelope, safe
  formatting document, and private download metadata.
- `receipt-validation.ts`: required fields, bounded personal/address text, strict
  timezone-aware dates, canonical tracking-number normalization, and recorded
  nonnegative safe-integer LKR cents. Validation creates a fresh explicit
  projection; unknown fields cannot override charges or add a payment claim.
- `receipt-document.ts`: exact monetary formatting via integer/BigInt arithmetic,
  Sri Lanka date formatting, optional source status/date handling, and brand text.
- `ReceiptPdfService`: A4 design, SwiftDrop dark green accents, parcel reference,
  sender/pickup and recipient/destination cards, parcel details, recorded fee,
  wrapping, additional pages when needed, and page counters. Produces a `Buffer`
  entirely in memory. It performs no file/network access and accepts no font paths.
- `ReceiptReader`: injectable ownership-scoped persistence port, bound to
  `ReceiptPrismaReader`. Its Prisma query includes both parcel ID and customer ID
  and selects only the fields needed for a private receipt. It does not use
  Member 2's numeric money projection or the merchant repository.
- `ReceiptService`: orchestrates identity, role, parcel ID, and ownership checks
  **before** validating private receipt details or invoking the PDF renderer.

`ReceiptService.getCustomerReceipt(user, parcelId)` accepts no receipt payload,
amount, customer ID, filename, or payment details from a request. The controller
passes `user` from the existing `@CurrentUser()` decorator with
the global JWT/Approval/Role guards and `@Roles(Role.CUSTOMER)` enabled.
The existing `requireCustomer` helper is reused; it does not replace live account
approval checks. Do not trust an identity constructed from request JSON.

The reader includes authenticated ownership in the storage query and checks the
returned owner/parcel IDs before mapping private values. The service checks those
IDs again before validation or PDF formatting. Missing, other-owned,
and mismatched records all return `404 Receipt not found` without generating
bytes. Source and rendering failures propagate; no replacement receipt is made.
`InvalidReceiptDataError` contains field names only, not personal values. The
controller maps domain/font errors to a generic receipt-unavailable response
without exposing receipt contents or internal exception details.

The download result includes a filename derived only from the validated tracking
number, `application/pdf`, and `private, no-store`. The controller applies the
safe attachment headers only after successful authorization and generation. Do not publish PDF files under a static uploads route.

## Receipt data and financial semantics

Required formatting fields: persisted `reference`, tracking number, `bookedAt`, sender
and recipient names, pickup/destination addresses, `deliveryFeeMinor`, and
`currency: 'LKR'`. Party phone numbers, source delivery status, and `deliveredAt`
are optional. Optional missing information is omitted or shown as "Not recorded";
no delivery success, date, or contact information is invented.

Only LKR is currently supported, with 100 minor units per rupee. Numeric strings,
fractional cents, negative amounts, non-finite values, unsafe integers, and other
currencies are rejected. A confirmed zero recorded fee is valid. Do not pass the
frontend's floating `costLkr` directly or recalculate historical charges from
current pricing. Other currencies need an explicit currency/scale contract.

The PDF says "Recorded delivery fee" and explicitly does not confirm payment.
It has no tax, payment, or invoice claims and no invented company address or tax
identifier. No receipt-number or payment record exists in the schema: `reference`
is the stored Parcel.id and is explicitly printed as "Parcel reference". It is
not a new invoice/receipt number generated by the formatter. Booking/delivery dates require ISO-8601
timestamps with explicit timezone information and display in Asia/Colombo time.
Any recorded delivery date must not precede booking.

Names are bounded to 100 characters, phones to 40, references/status labels to
80, addresses to 500 characters/eight lines. Controls and bidi overrides are
rejected. Long words wrap; data is never silently truncated to fit a page.

## Font limitation

`pdf-lib` is installed as an API runtime dependency. No additional renderer is
missing. The current renderer uses bundled Helvetica/Helvetica Bold, which do
not cover every script. Unicode data is preserved by validation and formatting,
but unsupported glyphs (including Sinhala/Tamil text) cause `ReceiptFontError`
before bytes are returned. The renderer never substitutes, strips, or
transliterates a customer's name/address.

Before multilingual production use, agree a licensed font asset and compatible
font embedding/shaping configuration. Any extra package/font must be separately
approved; there is no system-font lookup or remote font download fallback.

## Persisted mapping and eligibility

This is a booking-charge receipt for any parcel status, including CREATED,
ASSIGNED, PENDING, FAILED, and RETURNED, when its required stored data is valid.
It is not restricted to completed deliveries and does not prove payment or
successful delivery. The existing foundation's fee note defines these semantics.

The reader maps Parcel.id -> parcel reference; trackingNumber unchanged;
createdAt -> bookedAt; senderName/senderAddress -> recorded sender/pickup;
recipientName/recipientPhone/recipientAddress -> recorded recipient/destination;
status unchanged; and deliveredAt only when persisted. It never substitutes the
current profile, user-supplied data, current pricing, or updatedAt for those facts.
Member 2 currently stores the customer's email in senderName; the receipt prints
that recorded sender identity rather than inventing a historical full name.

The persisted costLkr Decimal(10,2) identifies its units as LKR. The reader parses
the Decimal's exact plain string with BigInt arithmetic into integer cents; it
does not use Number(costLkr)*100 or toFixed rounding. Missing/non-Decimal,
negative, overprecision, nonfinite, or out-of-range charges are rejected.
A zero stored charge is valid. No separate currency column is fabricated.

The receipt reflects the current persisted booking fields. A separate immutable
receipt archive, statutory invoice numbering, payment/tax records, refunds, and
changes to historical charges need an agreed future data contract. The incoming
courier writer does not populate deliveredAt; it is omitted when absent rather
than inferred from status or event timestamps. No broker/SSE integration is needed.

## Delivery History download action

The existing /customer/deliveries table retains View details and adds Download
receipt in the same action cell. Requests include cookie credentials, no-store,
and no-referrer. The browser saves the actual returned PDF Blob after checking
its MIME type and signature, with a bounded safe server filename (generic safe
fallback if the header is absent). It never builds receipt/PDF data from the row.
Each row shows loading/error/retry feedback and prevents duplicate requests.
Unmounting/removing a row aborts its request and suppresses late downloads;
temporary anchors/object URLs are cleaned up. Session failures use the page's
existing 401/403 behavior. Unsupported data/font responses show unavailable.

For manual verification, sign in as an approved customer, open
http://localhost:5173/customer/deliveries and choose Download receipt for a real
owned booking. Open the saved PDF and compare the parcel reference, tracking
number, booked date, recorded parties/addresses, status and fee against the
booking. Repeat with a legacy number and an active booking. A different customer
must receive 404 for the same parcel URL; signed-out requests receive 401.
The public /track page never provides receipt downloads.

## Verification

From the repository root:

```sh
npm run test -w apps/api -- --runInBand --watch=false --testPathPatterns=modules/tracking
npm run build -w apps/api
```

Run installed ESLint only against the tracking directory without `--fix`.
Tests use isolated `*.spec.ts` fixtures, excluded from production compilation.
They check formatting/amounts, required data, ownership-before-rendering, safe
download metadata, failures, and actual PDFs reloaded with pdf-lib. PDF content
streams are decoded to verify text, charges, wrapping, and page counters.
Mocked renderer output is used only for authorization unit tests. HTTP tests use
the actual module, guards, reader and pdf-lib renderer with isolated persistence
fixtures; they verify PDF text, exact amounts, response headers, ownership,
secure/legacy identifiers and unavailable failures. They open temporary localhost
sockets and never connect to PostgreSQL. No live database/browser test is claimed.
