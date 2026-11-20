# tools/mock-merchant — Demo merchant store

A tiny stand-in for a partner e-commerce site ("Lanka Gadgets"), used in the demo and in
tests. It has **no login**: like a real merchant's system, it talks to SwiftDrop only
through an API key.

1. **Test connection** — checks the saved API key with `GET /merchant-api/me` and shows
   which SwiftDrop merchant it belongs to.
2. **Checkout form** — creates delivery orders through the merchant API
   (`POST /merchant-api/orders`) with `X-API-Key` and an `Idempotency-Key`
   (available once the parcels service exists).
3. **Webhook receiver** — `POST /webhooks/swiftdrop` verifies the HMAC signature
   (`X-SwiftDrop-Signature`, `X-SwiftDrop-Timestamp`), ignores duplicate event IDs and
   shows every webhook it receives.
4. **Fail mode** — a toggle that answers every webhook with `500`, so we can demo
   webhook **retries**.

Not part of the production system — only runs locally / in `docker compose` for the demo.
State is kept in memory and resets on restart.

## Run it

```bash
npm run dev -w tools/mock-merchant      # from the repo root → http://localhost:5000
npm test -w tools/mock-merchant         # signature verification tests
```

| Variable | Default | Purpose |
|---|---|---|
| `MOCK_MERCHANT_PORT` | `5000` | Port the store listens on (from the root `.env`) |
| `SWIFTDROP_API_URL` | `http://localhost:4000/api/v1` | SwiftDrop API base URL; can also be changed on the page |

## Demo flow (works today)

1. Sign in to the SwiftDrop merchant portal → **Store connections** → **API keys** → create a key, copy it.
2. On the store page: paste the key → **Save** → **Test connection** → "Connected as …".
3. Portal → **Store connections** → **Webhooks** → register `http://localhost:5000/webhooks/swiftdrop`, copy the
   signing secret. On the store page: paste it → **Save**.
4. Portal → **Send test event** → the store shows it as **ACCEPTED** (signature verified).
5. Turn on **Fail mode**, send another test event → the portal shows **Retrying**. Turn fail
   mode off → about 30 s later SwiftDrop retries by itself and the store shows **ACCEPTED**.
6. Portal → **Rotate signing secret** without updating the store → the next event is
   rejected (401, not retried). Paste the new secret in the store → **Send again**.
7. Portal → **Store connections** → **API keys** → **Revoke** → **Test connection** now fails with 401.

## Once the parcels service exists

1. Fill in the checkout form → **Create order** → SwiftDrop returns the tracking number.
2. Change the parcel status (dispatcher / courier) → the webhook appears as **ACCEPTED**.

> The order and webhook payload fields follow `ARCHITECTURE.md` §7.4 and will be
> finalised together with the merchant order API.
