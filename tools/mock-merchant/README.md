# tools/mock-merchant — Demo merchant store

A tiny stand-in for a partner e-commerce site ("Lanka Gadgets"), used in the demo and in
tests. It has **no login**: like a real merchant's system, it talks to SwiftDrop only
through an API key.

1. **Checkout form** — creates delivery orders through the merchant API
   (`POST /merchant-api/orders`) with `X-API-Key` and an `Idempotency-Key`.
2. **Webhook receiver** — `POST /webhooks/swiftdrop` verifies the HMAC signature
   (`X-SwiftDrop-Signature`, `X-SwiftDrop-Timestamp`), ignores duplicate event IDs,
   ignores late retries of older events (`sequence`), and shows every webhook it receives
   with its delivery attempt.
3. **Your orders** — the store's own view of each order's status, built only from
   webhooks, so you can see a late retry doesn't roll a status back.
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
| `MOCK_MERCHANT_WEBHOOK_URL` | page origin + `/webhooks/swiftdrop` | Webhook URL the page tells you to register. Docker sets `http://mock-merchant:5000/webhooks/swiftdrop`: the worker calls the store directly, and the public `:8443` address is behind basic auth |

## Demo flow

1. **Register the webhook** as the merchant (there is no dashboard screen yet — use the
   API; the session cookie comes from logging in):

   ```bash
   # log in (stores the cookie in jar.txt)
   curl -c jar.txt -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json'      -X POST http://localhost:4000/api/v1/auth/login      -d '{"email":"merchant@swiftdrop.local","password":"<DEMO_MERCHANT_PASSWORD>"}'
   # register the URL — the response contains signingSecret ONCE
   curl -b jar.txt -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json'      -X PUT http://localhost:4000/api/v1/merchant/webhook      -d '{"url":"http://mock-merchant:5000/webhooks/swiftdrop"}'
   ```

   Use `http://mock-merchant:5000/...` when the worker runs in Docker, or
   `http://localhost:5000/...` when it runs on your machine. Both are private addresses,
   so the API and worker need `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` (dev) or
   `WEBHOOK_PRIVATE_HOST_ALLOWLIST=mock-merchant`.
2. On the store page: paste the API key and the **signing secret** → **Save**.
3. Change a parcel's status (dispatcher / courier) → the webhook shows as **ACCEPTED**
   and *Your orders* shows the new status.
4. Turn on **Fail mode**, change the status again → **FAIL_MODE** rows with attempt 1, 2 …
   (SwiftDrop retries after 30 s, 2 m, 8 m …); turn it off and the next attempt is
   **ACCEPTED**. `GET /api/v1/merchant/webhook/deliveries` shows the same attempts.

| Result | Reply | Meaning |
|---|---|---|
| `ACCEPTED` | 200 | Verified and applied |
| `DUPLICATE` | 200 | Same `eventId` already applied — acknowledged, ignored |
| `STALE` | 200 | Older `sequence` than what we have — acknowledged, ignored |
| `BAD_SIGNATURE` | 401 | Wrong secret or timestamp older than 5 min — SwiftDrop marks it FAILED, no retry |
| `FAIL_MODE` | 500 | Simulated outage — SwiftDrop retries |

Payload fields: `MerchantWebhookPayloadV1` in `packages/contracts/src/webhooks`.
Creating orders through the checkout form needs the merchant order API
(`POST /merchant-api/orders`), which is not in SwiftDrop yet.
