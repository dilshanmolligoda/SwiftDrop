# apps/web — Frontend (React + TypeScript)

Responsive single-page app for all four roles plus the public tracking page.

## Run it locally

From the **repo root** (API must be running for the health page):

```bash
cp apps/web/.env.example apps/web/.env   # once
npm run dev:web                          # web only → http://localhost:5173
npm run dev                              # API + web together
```

| Page | URL |
|---|---|
| Home | <http://localhost:5173> |
| Health check | <http://localhost:5173/health> — web, API and database status, tables and row counts (refreshes every 15s) |

## Environment

Vite reads `apps/web/.env` (not committed; template in [.env.example](.env.example)).
Only `VITE_*` variables reach the app, and **all of them are public** (bundled into the
JavaScript) — never put secrets here. Read them through [src/lib/env.ts](src/lib/env.ts).

| Variable | Local default |
|---|---|
| `VITE_API_BASE_URL` | `http://localhost:4000/api/v1` |
| `VITE_AI_ASSISTANT_URL` | `http://localhost:3100` |

In Docker the values come from the root `.env` as build args instead. The API only accepts
requests from origins listed in `CORS_ORIGINS` (root `.env`, default `http://localhost:5173`).

## Scripts

Run from the repo root with `-w apps/web`, or inside `apps/web`:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with [oxlint](https://oxc.rs) |

## Layout

Routes are declared in [src/main.tsx](src/main.tsx). ✅ = exists today, the rest is planned.

```text
apps/web/src/
├── main.tsx            # ✅ entry + routes
├── env.d.ts            # ✅ types for VITE_* variables
├── app/                # router, providers, role-based route guards
├── api/                # typed API client, auth token refresh, SSE helper
├── features/           # one folder per business area
│   ├── auth/           # login, register, Google login callback
│   ├── customer/       # create delivery, fee estimate, history, receipts
│   ├── tracking/       # live tracking timeline + public tracking page (mobile-first)
│   ├── merchant/       # dashboard, API keys, webhook settings
│   ├── courier/        # today's deliveries, status update, proof upload
│   ├── dispatch/       # unassigned parcels, assignment, workloads
│   ├── admin/          # users, merchants, zones, pricing, reports
│   ├── assistant/      # AI chat widget (bonus)
│   └── health/         # ✅ /health status page
├── components/         # shared UI components
├── hooks/
├── lib/                # utils, formatters, constants (✅ env.ts)
└── styles/
```

Pages for one role live in that role's `features/` folder, so teammates rarely edit the
same files.
