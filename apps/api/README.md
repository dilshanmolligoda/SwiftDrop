# apps/api — Backend API (NestJS)

The core of SwiftDrop: a **modular monolith** that serves the web app (BFF role), the public
merchant API, public tracking and the SSE live-tracking stream.

Planned module layout and rules: [README.plan.md](README.plan.md).

## Run it locally

From the **repo root**:

```bash
docker compose up -d                       # PostgreSQL, RabbitMQ, Mailpit
npm install                                # once
cp .env.example .env                       # once — shared config (if you haven't)
cp apps/api/.env.example apps/api/.env     # once — local overrides, see below
npm run dev:api                            # hot reload
```

API: <http://localhost:4000/api/v1> · Health: <http://localhost:4000/api/v1/health>
(`200` when the API and database are up, `503` otherwise; used by the Docker healthcheck)

Database overview (dev only, `404` when `NODE_ENV=production`):
<http://localhost:4000/api/v1/health/db> shows Postgres version, size, every table with its
row count, and applied migrations.

## Environment

Config is loaded by `@nestjs/config` in [src/app.module.ts](src/app.module.ts) and by
[prisma.config.ts](prisma.config.ts), in this order (first one wins):

1. **Real environment variables** — e.g. Docker's `env_file`, or anything exported in your terminal
2. **`apps/api/.env`** — local overrides for running on your machine (not committed)
3. **Repo-root `.env`** — shared config for every app (not committed)

Why two files: in Docker the database host is `postgres`, but on your machine it's
`localhost`. So `apps/api/.env` only overrides `DATABASE_URL`; everything else
(`API_PORT=4000`, JWT, RabbitMQ, …) comes from the root `.env`.

The app refuses to start if a required variable is missing
([src/config/env.validation.ts](src/config/env.validation.ts)). When you add a new variable,
add it to the root [.env.example](../../.env.example) (and to `REQUIRED` if the app can't run without it).

| Variable | Default | Purpose |
|---|---|---|
| `API_PORT` | `4000` | HTTP port |
| `API_PREFIX` / `API_VERSION` | `api` / `1` | Routes are served under `/api/v1` |
| `DATABASE_URL` | — (required) | PostgreSQL connection for Prisma |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated origins allowed to call the API from a browser |

## Database (Prisma 7)

Schema: [prisma/schema.prisma](prisma/schema.prisma). Run from the repo root (or drop
the root prefix and run `npm run db:*` inside `apps/api`):

| Command | What it does |
|---|---|
| `npm run db:migrate -- --name <change>` | Create and apply a migration (dev only) |
| `npm run db:deploy` | Apply existing migrations (CI / Docker) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:status` | Show migration status |
| `npm run db:validate` | Check the schema |
| `npm run db:studio` | Browse data in the browser |

Prisma commands must run with `apps/api` as the working directory (the scripts handle that),
so `prisma.config.ts` and the `.env` files are found.

## Tests

```bash
npm run test -w apps/api        # unit
npm run test:e2e -w apps/api    # e2e
npm run test:cov -w apps/api    # coverage
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `EADDRINUSE :::3000` or API on the wrong port | Your terminal has a stale `API_PORT`/`PORT` exported. `unset API_PORT PORT` or open a new terminal. |
| `EADDRINUSE :::4000` | Something else uses port 4000 (another project's container?). Check with `docker ps` / `netstat -ano \| findstr :4000`. |
| `P1001: Can't reach database server at postgres:5432` | `DATABASE_URL` from the root `.env` is exported in your terminal, or `apps/api/.env` is missing. `unset DATABASE_URL`, and copy `apps/api/.env.example`. |
| `P1000: Authentication failed` | Postgres keeps the password it was **first** created with. If you changed `POSTGRES_PASSWORD` later, either reset the DB (`docker compose down -v`, wipes data) or run `docker compose exec postgres psql -U swiftdrop -c "ALTER USER swiftdrop WITH PASSWORD '<new>';"` |
| `Missing required environment variables` | Copy the `.env.example` files (root and `apps/api`). |

> Never `source .env` in your terminal — exported values override the `.env` files and
> cause the first three problems above.
