import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  RealtimeClientEvent,
  RealtimeRoom,
  RealtimeServerEvent,
  type PublicRealtimeParcelUpdateV1,
  type RealtimeAck,
  type RealtimeParcelUpdateV1,
} from '@swiftdrop/contracts';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import { Role } from '../../generated/prisma/enums.js';
import { isPublicTrackingNumber } from '../parcels/parcel-tracking-number.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { ParcelAccessService } from './parcel-access.service.js';
import { RealtimeAuthService } from './realtime-auth.service.js';

/** Rooms one socket may hold via `subscribe` (role rooms don't count). */
export const MAX_SUBSCRIPTIONS = 20;
/** `subscribe` requests per socket per minute. */
export const MAX_SUBSCRIBES_PER_MINUTE = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SocketState {
  /** Resolves once the connection's authentication has finished. */
  ready: Promise<void>;
  user: AuthenticatedUser | null;
  subscriptions: Set<string>;
  subscribeTimes: number[];
  expiryTimer?: NodeJS.Timeout;
}

type ClientSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketState
>;

/**
 * Live parcel updates (ADR 0002). Path, transport and Origin checks are set by
 * RealtimeIoAdapter. Contract: packages/contracts/src/realtime.
 *
 * - On connect, signed-in users join their role room (merchant:{id},
 *   courier:{id}, dispatch). Anonymous sockets are allowed for public tracking.
 * - `subscribe` joins parcel:{id} (after an ownership check) or
 *   public:{trackingNumber} (secure tracking numbers only).
 * - The socket is closed when its access token expires; the client refreshes
 *   and reconnects.
 */
// Sockets are authenticated by RealtimeAuthService. The APP_GUARD guards are
// HTTP-only and Nest does not run them on gateway messages (verified in
// realtime.integration.spec); @Public() keeps it that way if that changes.
@Public()
@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly auth: RealtimeAuthService,
    private readonly access: ParcelAccessService,
  ) {}

  handleConnection(socket: ClientSocket): Promise<void> {
    socket.data = {
      ready: Promise.resolve(),
      user: null,
      subscriptions: new Set(),
      subscribeTimes: [],
    };
    // A client may send `subscribe` right after connecting; it waits for this.
    socket.data.ready = this.authenticate(socket);
    return socket.data.ready;
  }

  private async authenticate(socket: ClientSocket): Promise<void> {
    try {
      const identity = await this.auth.identify(socket.handshake);
      if (!identity) return; // anonymous: public tracking only

      socket.data.user = identity.user;
      const roleRoom = roleRoomFor(identity.user);
      if (roleRoom) await socket.join(roleRoom);

      if (identity.expiresAt !== null) {
        const ms = Math.max(0, identity.expiresAt - Date.now());
        socket.data.expiryTimer = setTimeout(() => socket.disconnect(true), ms);
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Realtime connection setup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: ClientSocket): void {
    clearTimeout(socket.data?.expiryTimer);
  }

  @SubscribeMessage(RealtimeClientEvent.SUBSCRIBE)
  async subscribe(
    @ConnectedSocket() socket: ClientSocket,
    @MessageBody() body: unknown,
  ): Promise<RealtimeAck> {
    const state = socket.data;
    await state.ready;
    if (!this.allowSubscribe(state)) {
      return { ok: false, code: 'TOO_MANY_SUBSCRIPTIONS' };
    }
    const room = await this.roomFor(state.user, body);
    if (!room.ok) return room;

    if (!state.subscriptions.has(room.name)) {
      if (state.subscriptions.size >= MAX_SUBSCRIPTIONS) {
        return { ok: false, code: 'TOO_MANY_SUBSCRIPTIONS' };
      }
      state.subscriptions.add(room.name);
      await socket.join(room.name);
    }
    return { ok: true };
  }

  @SubscribeMessage(RealtimeClientEvent.UNSUBSCRIBE)
  async unsubscribe(
    @ConnectedSocket() socket: ClientSocket,
    @MessageBody() body: unknown,
  ): Promise<RealtimeAck> {
    const name = roomName(body);
    if (!name) return { ok: false, code: 'INVALID_REQUEST' };
    if (socket.data.subscriptions.delete(name)) {
      await socket.leave(name);
    }
    return { ok: true };
  }

  /** Sends one update to everyone allowed to see it. */
  broadcast(
    update: RealtimeParcelUpdateV1,
    publicUpdate: PublicRealtimeParcelUpdateV1,
    routing: { merchantId: string | null; courierId: string | null },
  ): void {
    if (!this.server) return;
    const privateRooms = [
      RealtimeRoom.parcel(update.parcelId),
      RealtimeRoom.dispatch,
      ...(routing.merchantId
        ? [RealtimeRoom.merchant(routing.merchantId)]
        : []),
      ...(routing.courierId ? [RealtimeRoom.courier(routing.courierId)] : []),
    ];
    // One emit to several rooms: a socket in more than one gets it once.
    this.server
      .to(privateRooms)
      .emit(RealtimeServerEvent.PARCEL_UPDATED, update);
    this.server
      .to(RealtimeRoom.publicTracking(publicUpdate.trackingNumber))
      .emit(RealtimeServerEvent.PUBLIC_PARCEL_UPDATED, publicUpdate);
  }

  private async roomFor(
    user: AuthenticatedUser | null,
    body: unknown,
  ): Promise<{ ok: true; name: string } | Exclude<RealtimeAck, { ok: true }>> {
    if (!isObject(body)) return { ok: false, code: 'INVALID_REQUEST' };

    if (body.scope === 'public') {
      const trackingNumber = normalizeTracking(body.trackingNumber);
      // Same rule as public REST tracking: only unguessable numbers. Unknown
      // numbers still "succeed", so subscribing reveals nothing.
      if (!trackingNumber || !isPublicTrackingNumber(trackingNumber)) {
        return { ok: false, code: 'INVALID_REQUEST' };
      }
      return { ok: true, name: RealtimeRoom.publicTracking(trackingNumber) };
    }

    if (body.scope === 'parcel') {
      if (typeof body.parcelId !== 'string' || !UUID.test(body.parcelId)) {
        return { ok: false, code: 'INVALID_REQUEST' };
      }
      if (!user) return { ok: false, code: 'UNAUTHENTICATED' };
      const parcelId = body.parcelId.toLowerCase();
      return (await this.access.canWatch(user, parcelId))
        ? { ok: true, name: RealtimeRoom.parcel(parcelId) }
        : { ok: false, code: 'NOT_FOUND' };
    }

    return { ok: false, code: 'INVALID_REQUEST' };
  }

  private allowSubscribe(state: SocketState): boolean {
    const now = Date.now();
    state.subscribeTimes = state.subscribeTimes.filter((t) => now - t < 60_000);
    if (state.subscribeTimes.length >= MAX_SUBSCRIBES_PER_MINUTE) return false;
    state.subscribeTimes.push(now);
    return true;
  }
}

function roleRoomFor(user: AuthenticatedUser): string | null {
  switch (user.role) {
    case Role.MERCHANT:
      return RealtimeRoom.merchant(user.id);
    case Role.COURIER:
      return RealtimeRoom.courier(user.id);
    case Role.DISPATCHER:
    case Role.ADMIN:
      return RealtimeRoom.dispatch;
    default:
      return null;
  }
}

/** Room name for an unsubscribe request, without any access check. */
function roomName(body: unknown): string | null {
  if (!isObject(body)) return null;
  if (body.scope === 'public') {
    const tracking = normalizeTracking(body.trackingNumber);
    return tracking ? RealtimeRoom.publicTracking(tracking) : null;
  }
  if (body.scope === 'parcel' && typeof body.parcelId === 'string') {
    return UUID.test(body.parcelId)
      ? RealtimeRoom.parcel(body.parcelId.toLowerCase())
      : null;
  }
  return null;
}

function normalizeTracking(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 && normalized.length <= 64 ? normalized : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
