# Deploying events, webhooks, notifications and live updates

For whoever deploys SwiftDrop to the Azure server with
[`infra/production/docker-compose.prod.yml`](../../infra/production/docker-compose.prod.yml).
Covers the features from PRs #35, #38 and #39.

## What's new at runtime

- A new **`worker`** container (image `ghcr.io/dilshanmolligoda/swiftdrop-worker`). It
  sends merchant webhooks and customer emails. It has no public port; its health check is
  internal on :4010.
- The **API now uses RabbitMQ**. Events are saved in Postgres first (transactional outbox),
  then published, so nothing is lost if RabbitMQ restarts.
- **Live updates over WebSocket** at `/api/v1/realtime`. They go through Caddy's existing
  `/api/*` rule, so **no Caddyfile change** is needed.
- **One database migration** (`20261121120000_add_events_webhooks_notifications`),
  additive only. The `migrate` service applies it automatically.

## 1. Check the new image is pullable

CD now also publishes `swiftdrop-worker`. A new GHCR package can start out **private**.
Make it match the existing `swiftdrop-api` package's visibility, or run
`docker login ghcr.io` on the server with a token that has `read:packages`.

## 2. Update the server `.env`

The `.env` file sits next to `docker-compose.prod.yml`.

In production the API and worker **refuse to start** if these are missing or wrong:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `RABBITMQ_URL` | `amqp://<user>:<password>@rabbitmq:5672`. Use a real password, not `<change-me>`, and URL-encode any special characters. |
| `WEBHOOK_SECRET_ENCRYPTION_KEY` | `openssl rand -base64 32`. **Generate it once, store it in Key Vault, and never change it.** Changing it makes every merchant's stored webhook secret unreadable, and they'd all have to rotate. |
| `SMTP_HOST` | `mailpit` (and `SMTP_PORT=1025`). Or set `NOTIFY_EMAIL_ENABLED=false`. |

Also set:

| Variable | Value | Why |
|---|---|---|
| `CORS_ORIGINS` | `https://<SITE_ADDRESS>`: exact origin, no trailing slash | The WebSocket also checks this. A mismatch leaves the "Live" badge stuck on "Reconnecting…". |
| `WEB_APP_URL` | `https://<SITE_ADDRESS>` | Links in customer emails |
| `WEBHOOK_PRIVATE_HOST_ALLOWLIST` | `mock-merchant` | Lets the demo store on the Docker network receive webhooks |
| `SMTP_FROM` | e.g. `SwiftDrop <no-reply@your-domain>` | Email sender |

**Don't set `WEBHOOK_ALLOW_PRIVATE_TARGETS=true`.** That's a dev-only switch, and
production refuses to start with it.

The other settings have sensible defaults; see [`.env.example`](../../.env.example).

> **RabbitMQ password:** RabbitMQ only creates its user the first time the
> `rabbitmq-data` volume is created. If that volume already exists, changing
> `RABBITMQ_DEFAULT_PASS` later has no effect. Either keep the existing password in
> `RABBITMQ_URL`, or change it inside the container with `rabbitmqctl change_password`.

## 3. Deploy

```bash
# CD builds :main from main (and :dev from dev). The compose file uses TAG (default main).
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

The start-up order is already set in the compose file: Postgres and RabbitMQ, then
`migrate`, then API and worker.

## 4. Azure checks

- **Network security group: no new inbound ports.** The WebSocket uses 443 through
  Caddy. Keep RabbitMQ (5672/15672), Postgres and the worker closed to the internet; they
  have no `ports:` mapping.
- **Outbound HTTPS must be allowed**, because webhooks call merchants' servers.
- **Azure blocks outbound port 25.** For real email instead of Mailpit, use a provider on
  port 587 (Azure Communication Services Email or SendGrid) and set `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER` and `SMTP_PASSWORD`.
- **Backups:** include the `rabbitmq-data` volume as well as `postgres-data`; it holds
  queued and dead-lettered messages.
- **Memory:** the worker adds roughly 100–150 MB.

## 5. Verify after deploy

```bash
curl -s https://<SITE_ADDRESS>/api/v1/health          # expect "messaging":"up" and "outbox":{"pending":0,...}
docker compose -f docker-compose.prod.yml ps          # worker: healthy
docker compose -f docker-compose.prod.yml logs worker | grep consuming   # 2 lines: notifications + webhooks
docker compose -f docker-compose.prod.yml exec rabbitmq rabbitmqctl list_queues name messages consumers
```

Then a quick functional test:

1. Log in as the merchant → **Store connections** → URL
   `http://mock-merchant:5000/webhooks/swiftdrop` → paste the shown secret into the mock
   store (`:8443`).
2. Change one of that merchant's parcels' status. The mock store should show
   **ACCEPTED**, and Store connections should show **Delivered**.
3. Check that an email arrived in Mailpit (`:8025`).
4. On Customer → Track, the page should show **● Live**. In browser DevTools → Network →
   WS, `wss://<site>/api/v1/realtime` should be status **101**.

## Operations

- **Monitoring:**
  - `/api/v1/health` → `outbox.pending` growing means events aren't reaching RabbitMQ.
  - Failed messages sit in `notifications.dead-letter` and `webhooks.dead-letter`
    (check with `list_queues`).
- **Scaling:** `--scale worker=2` and several API copies are both safe. One caveat:
  public tracking's rate limit is per process (see the tracking module README).
- **Restarts:** safe at any time. Events wait in Postgres or in durable queues.
- **Rollback:** the migration only adds tables and a nullable column, so older images
  still run against it.

## Troubleshooting

| Symptom | Cause |
|---|---|
| API exits: "RABBITMQ_URL is required in production" or "…placeholder" | Step 2 |
| API or worker exits: "WEBHOOK_SECRET_ENCRYPTION_KEY must be 32 bytes" | Step 2 |
| Worker exits: "SMTP_HOST is required in production" | Set `SMTP_HOST` or `NOTIFY_EMAIL_ENABLED=false` |
| `/health` says `messaging: down` | `RABBITMQ_URL` must use host `rabbitmq` (the compose service name) and the right password |
| "Live" stays "Reconnecting…" | `CORS_ORIGINS` doesn't exactly match the site origin |
| A webhook is FAILED with "refused to connect to private address" | The merchant's URL is internal and not in `WEBHOOK_PRIVATE_HOST_ALLOWLIST` (blocked on purpose) |

## More detail

- [`apps/worker/README.md`](../../apps/worker/README.md): consumers, retries, settings
- [`apps/api/src/modules/realtime/README.md`](../../apps/api/src/modules/realtime/README.md): WebSocket rooms and client rules
- [`apps/api/src/infrastructure/outbox/README.md`](../../apps/api/src/infrastructure/outbox/README.md): recording events
- [`tools/mock-merchant/README.md`](../../tools/mock-merchant/README.md): demo store
- [ARCHITECTURE.md](../../ARCHITECTURE.md) §7–8
