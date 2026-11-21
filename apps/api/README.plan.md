# apps/api — Backend API (NestJS)

The core of SwiftDrop: a **modular monolith** that serves the web app (BFF role), the public
merchant API, public tracking and the SSE live-tracking stream.

> Not scaffolded yet. Create it with:
> `npx @nestjs/cli new api --directory apps/api --package-manager npm --skip-git`

## Planned layout

```text
apps/api/
├── prisma/
│   ├── schema/                 # multi-file Prisma schema, one file per module
│   └── migrations/
├── src/
│   ├── main.ts                 # bootstrap: versioning (/api/v1), ValidationPipe, Swagger, Helmet
│   ├── app.module.ts
│   ├── config/                 # env loading + validation (fails fast on missing vars)
│   ├── common/                 # cross-cutting code, no business logic
│   │   ├── filters/            # global exception filter → safe JSON errors
│   │   ├── guards/             # JwtAuthGuard, RolesGuard, ApiKeyGuard
│   │   ├── decorators/         # @Roles(), @CurrentUser(), @Public()
│   │   ├── interceptors/       # logging (with PII redaction), timing
│   │   └── pipes/
│   ├── infrastructure/
│   │   ├── prisma/             # PrismaService
│   │   ├── messaging/          # RabbitMQ connection + outbox publisher
│   │   └── storage/            # proof-of-delivery file storage
│   └── modules/
│       ├── auth/               # login, register, Google OAuth (PKCE), refresh tokens
│       ├── users/
│       ├── merchants/          # registration, approval, API keys, webhook config
│       ├── parcels/            # create, status state machine, history, receipts
│       ├── pricing/            # zones, pricing rules, fee estimation (Strategy)
│       ├── dispatch/           # unassigned parcels, assignment, workloads
│       ├── courier/            # today's deliveries, status updates, proof upload
│       ├── tracking/           # public tracking + SSE stream
│       └── reports/
└── test/                       # e2e + integration tests (Supertest, Testcontainers)
```

Inside each module:

```text
modules/parcels/
├── parcels.module.ts
├── controllers/     # HTTP only: routes, DTOs in/out, guards
├── dto/             # class-validator request/response classes
├── services/        # business rules (use cases)
├── domain/          # entities, status state machine, value objects
├── repositories/    # data access (Repository pattern over Prisma)
└── __tests__/       # unit tests next to the code
```

**Rule:** a module talks to another module only through that module's exported service —
never by reaching into its repository or tables.
