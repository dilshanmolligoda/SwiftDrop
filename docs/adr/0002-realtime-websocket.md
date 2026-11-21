# ADR 0002 — WebSocket (Socket.IO) for real-time updates

- **Status:** Accepted — supersedes decision 3 (SSE) in the ARCHITECTURE.md decision log
- **Date:** 2026-11-21

## Context

Decision 3 chose Server-Sent Events (SSE) for live parcel tracking. Since then, the
real-time scope has grown beyond one tracking page:

- customer tracking and public tracking pages,
- the merchant dashboard (orders changing status),
- the courier screen (new assignments) and the dispatcher screen.

The team assignment for this work also names WebSocket explicitly. Nothing real-time is
built yet (the tracking module notes "Real-time endpoints remain unregistered"), so
switching now costs nothing.

## Decision

Use **Socket.IO** through `@nestjs/websockets` in the API, served at
`/api/v1/realtime` (under `/api/`, so the production Caddy proxy forwards it unchanged).

- **Auth:** the same httpOnly access-token cookie as REST; `Origin` checked against
  `CORS_ORIGINS`. Anonymous sockets may only subscribe to public tracking.
- **Rooms:** `merchant:{id}`, `courier:{id}` and `dispatch` are joined automatically by
  role on connect; `parcel:{id}` and `public:{trackingNumber}` are joined with a
  `subscribe` message after an ownership / tracking-number check.
- **Fan-out across replicas:** each API instance consumes its own exclusive, auto-delete
  `realtime.{instanceId}` queue bound to `parcel.events`, and emits to its local rooms.
  No Redis adapter and no sticky sessions.
- **Missed updates:** not replayed. On every (re)connect the client re-reads state over
  REST, then applies updates with a higher `sequence`.

Names and payloads are in `packages/contracts/src/realtime`.

## Consequences

- ✅ One connection per browser serves every screen; server-to-client and client-to-server
  (subscribe/unsubscribe with acknowledgements) on the same channel.
- ✅ Built-in reconnection, heartbeat and long-polling fallback for proxies that block
  WebSocket upgrades.
- ✅ Works with any number of API replicas through RabbitMQ.
- ⚠️ Adds `socket.io` / `socket.io-client` dependencies (~45 KB gzipped on the client).
- ⚠️ Cookie auth on a WebSocket needs an explicit `Origin` check (no CSRF token on the
  handshake).
- ⚠️ Without sticky sessions, the long-polling fallback needs either sticky sessions or
  `transports: ['websocket']`. We start with WebSocket-only transport.
