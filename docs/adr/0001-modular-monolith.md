# ADR 0001 — Modular monolith with a separate worker

- **Status:** Accepted
- **Date:** 2026-10-10

## Context

SwiftDrop needs customer, merchant, courier and admin features, a merchant API,
asynchronous notifications and webhooks, and live tracking. The team has 10 members and a
fixed semester deadline. The assignment allows layered, microservices, or a modular
monolith with a BFF.

## Decision

Build the backend as a **NestJS modular monolith** (one API app, one database, business
modules with explicit boundaries) that also serves as the BFF for the React app. Run
asynchronous work in a **separate NestJS worker** connected through **RabbitMQ**, and
publish events using a **transactional outbox**.

## Consequences

- ✅ Business rules that touch several modules (create parcel + price + history) run in
  one database transaction.
- ✅ One API container to run and debug; simple local setup.
- ✅ Slow or failing external calls (SMTP, merchant webhooks) never block HTTP requests.
- ✅ Each module has one owner → parallel work with few conflicts.
- ⚠️ Module boundaries are enforced by convention and code review, not by the network.
- ⚠️ The whole API is deployed together; acceptable at this scale.

## Template for new ADRs

Copy this file to `NNNN-short-title.md` with the sections **Context**, **Decision**,
**Consequences**, and add a row to the decision log in `ARCHITECTURE.md`.
