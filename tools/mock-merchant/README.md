# tools/mock-merchant — Demo merchant store

A tiny stand-in for a partner e-commerce site ("Lanka Gadgets"), used in the demo and in
tests. It has **no login**: like a real merchant's system, it talks to SwiftDrop only
through an API key.

1. **Checkout form** — creates delivery orders through the merchant API
   (`POST /merchant-api/orders`) with `X-API-Key` and an `Idempotency-Key`.
2. **Webhook receiver** — `POST /webhooks/swiftdrop` verifies the HMAC signature
   (`X-SwiftDrop-Signature`, `X-SwiftDrop-Timestamp`), ignores duplicate event IDs and
   shows every webhook it receives.
3. **Fail mode** — a toggle that answers every webhook with `500`, so we can demo
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

## Demo flow

1. In SwiftDrop (merchant account): create an API key and register the webhook URL shown
   on the store page (`http://localhost:5000/webhooks/swiftdrop`), copy the signing secret.
2. On the store page: paste the API key and signing secret → **Save**.
3. Fill in the checkout form → **Create order** → SwiftDrop returns the tracking number.
4. Change the parcel status (dispatcher / courier) → the webhook appears as **ACCEPTED**.
5. Turn on **Fail mode**, change the status again → SwiftDrop retries with backoff; turn
   it off and the next retry is **ACCEPTED**.

> The order and webhook payload fields follow `ARCHITECTURE.md` §7.4 and will be
> finalised together with the merchant order API.
