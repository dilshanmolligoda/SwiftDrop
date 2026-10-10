# apps/web — Frontend (React + TypeScript)

Responsive single-page app for all four roles plus the public tracking page.

> Not scaffolded yet. Create it with:
> `npm create vite@latest apps/web -- --template react-ts`

## Planned layout

```text
apps/web/src/
├── main.tsx
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
│   └── assistant/      # AI chat widget (bonus)
├── components/         # shared UI components
├── hooks/
├── lib/                # utils, formatters, constants
└── styles/
```

Pages for one role live in that role's `features/` folder, so teammates rarely edit the
same files.
