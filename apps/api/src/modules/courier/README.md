# Courier API

All routes are under `/api/v1/courier` and require the existing authenticated session plus the `COURIER` role. The API takes the courier ID exclusively from the authenticated JWT context. IDs supplied by callers never select the courier identity.

## Routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/dashboard` | Today's active assignment counts by state, using the Asia/Colombo calendar day. |
| `GET` | `/deliveries/today` | Paginated active deliveries assigned today. Optional `page`, `limit` (maximum 100), `status`, and `search` query parameters. Search matches tracking number and recipient name. |
| `GET` | `/deliveries/:parcelId` | Details, recipient, assignment, chronological status events, and safe proof metadata. Returns `404` for non-owned or inactive assignments. |
| `PATCH` | `/deliveries/:parcelId/status` | Apply an allowed status transition and optional note. A `DELIVERED` update requires `proofId`; a `FAILED` update requires `failureReason`. |
| `POST` | `/deliveries/:parcelId/proof` | Upload one `multipart/form-data` image in the `file` field. JPEG, PNG, and WebP are accepted up to 5 MiB. |
| `POST` | `/deliveries/:parcelId/failure` | Record a failed delivery with required `failureReason` and optional `note`. An identical retry returns the prior failure event. |

## Example requests

```http
GET /api/v1/courier/deliveries/today?page=1&limit=20&status=OUT_FOR_DELIVERY&search=SD-001
```

```json
{
  "status": "DELIVERED",
  "proofId": "44444444-4444-4444-8444-444444444444",
  "note": "Handed to recipient"
}
```

```json
{
  "failureReason": "RECIPIENT_UNAVAILABLE",
  "note": "Attempted call; no answer"
}
```

Allowed transitions are `ASSIGNED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED | FAILED`. `DELIVERED` requires proof metadata tied to the same parcel, active assignment, and authenticated courier. `FAILED` requires a reason.

Proof storage is injected via the `OBJECT_STORAGE` abstraction. The development adapter writes opaque UUID-based objects under the ignored `uploads/proofs` directory (or configured `PROOF_STORAGE_DIR`). Files are not served from a public static route, and API responses never include filesystem paths or storage keys. Production object storage can be supplied by binding another adapter to the same token.
