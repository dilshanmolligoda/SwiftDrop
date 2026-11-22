# Realtime — live parcel updates (Socket.IO)

Decision: [ADR 0002](../../../../../docs/adr/0002-realtime-websocket.md). Names and payload
types: `packages/contracts/src/realtime`.

```text
status change → outbox → RabbitMQ parcel.events
   └─ realtime.{instanceId}  (one exclusive, auto-delete queue per API instance)
        └─ RealtimeFanoutService → RealtimeGateway → sockets in the matching rooms
```

## Connect (browser)

```ts
import { io } from 'socket.io-client';
import { REALTIME_SOCKET_PATH, RealtimeServerEvent } from '@swiftdrop/contracts';

const socket = io(API_ORIGIN, {           // e.g. http://localhost:4000
  path: REALTIME_SOCKET_PATH,             // /api/v1/realtime
  transports: ['websocket'],              // the server accepts WebSocket only
  withCredentials: true,                  // sends the httpOnly access_token cookie
});
```

Signed-in users are recognised from the same cookie as REST. Anonymous sockets work too,
for public tracking only.

## Rooms

| Room | How you get in | Who |
|---|---|---|
| `merchant:{id}` · `courier:{id}` · `dispatch` | automatically on connect, by role | merchant · courier · dispatcher/admin |
| `parcel:{parcelId}` | `subscribe` `{ scope: 'parcel', parcelId }` | customer (own), courier (assigned), merchant (own), dispatcher/admin |
| `public:{trackingNumber}` | `subscribe` `{ scope: 'public', trackingNumber }` | anyone, secure `SD-` + 32 hex numbers only |

```ts
const ack = await socket.emitWithAck('subscribe', { scope: 'parcel', parcelId });
// { ok: true } | { ok: false, code: 'UNAUTHENTICATED' | 'NOT_FOUND' | 'INVALID_REQUEST' | 'TOO_MANY_SUBSCRIPTIONS' }
socket.on(RealtimeServerEvent.PARCEL_UPDATED, (u) => …);        // parcelId, trackingNumber, status, previousStatus, occurredAt, sequence
socket.on(RealtimeServerEvent.PUBLIC_PARCEL_UPDATED, (u) => …); // trackingNumber, status, occurredAt, sequence
```

## Rules for clients

1. **On every `connect` (including reconnects): re-read the state over REST, then
   re-subscribe.** Updates sent while disconnected are not replayed.
2. Apply an update only if its `sequence` is higher than the last one applied for that
   parcel (`isNewerUpdate` in contracts) — updates can arrive out of order.
3. The server closes the socket when the access token expires; refresh the token
   (`POST /auth/refresh`) and reconnect.

## Security

- `Origin` must be in `CORS_ORIGINS` (checked on the upgrade; CORS does not cover WebSockets).
- Live account check on connect, like `ApprovalGuard`: inactive or unapproved accounts are
  treated as anonymous. The role comes from the database, not the token.
- "Not yours" and "does not exist" both answer `NOT_FOUND`.
- At most 20 subscribed rooms and 30 `subscribe` calls per minute per socket; client
  messages are capped at 4 KB.
- Public updates are built field by field (`toPublicRealtimeParcelUpdate`), so private
  fields can't leak.
