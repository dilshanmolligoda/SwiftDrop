# tools/mock-merchant — Demo merchant store

A tiny stand-in for a partner e-commerce site, used in the demo and in tests:

1. Creates delivery orders through the merchant API using an API key.
2. Exposes `POST /webhooks/swiftdrop` that verifies the HMAC signature and prints/stores
   every status webhook it receives.
3. Has a "fail mode" toggle that returns `500`, so we can demo webhook **retries**.

Not part of the production system — only runs in `docker compose` for local/demo use.
