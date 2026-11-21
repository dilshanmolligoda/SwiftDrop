import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  REALTIME_SOCKET_PATH,
  type PublicRealtimeParcelUpdateV1,
  type RealtimeParcelUpdateV1,
} from '@swiftdrop/contracts';
import { io, type Socket } from 'socket.io-client';
import { Role } from '../../generated/prisma/enums.js';
import { MessagingModule } from '../../infrastructure/messaging/messaging.module.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ApprovalGuard } from '../auth/guards/approval.guard.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UsersService } from '../users/users.service.js';
import { RealtimeIoAdapter } from './realtime-io.adapter.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeModule } from './realtime.module.js';

const SECRET = 'realtime-integration-secret-at-least-32-bytes';
const ORIGIN = 'http://localhost:5173';

const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const OTHER_CUSTOMER = '33333333-3333-4333-8333-333333333333';
const MERCHANT = '66666666-6666-4666-8666-666666666666';
const PENDING_MERCHANT = '77777777-7777-4777-8777-777777777777';
const PARCEL = '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b';
const TRACKING = 'SD-0123456789ABCDEF0123456789ABCDEF';

const accounts: Record<string, { role: Role; approvalStatus: string }> = {
  [CUSTOMER]: { role: Role.CUSTOMER, approvalStatus: 'APPROVED' },
  [OTHER_CUSTOMER]: { role: Role.CUSTOMER, approvalStatus: 'APPROVED' },
  [MERCHANT]: { role: Role.MERCHANT, approvalStatus: 'APPROVED' },
  [PENDING_MERCHANT]: { role: Role.MERCHANT, approvalStatus: 'PENDING' },
};

describe('Realtime gateway (integration, real Socket.IO)', () => {
  let app: INestApplication;
  let url: string;
  let jwt: JwtService;
  let gateway: RealtimeGateway;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const prisma = {
      // Only the customer owns PARCEL.
      parcel: {
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(
            where.id === PARCEL && where.customerId === CUSTOMER
              ? { id: PARCEL }
              : null,
          ),
        ),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
    const users = {
      findById: jest.fn((id: string) =>
        Promise.resolve(
          accounts[id]
            ? {
                id,
                email: `${id}@example.test`,
                isActive: true,
                ...accounts[id],
              }
            : null,
        ),
      ),
    };

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ NODE_ENV: 'test', JWT_ACCESS_SECRET: SECRET })],
        }),
        JwtModule.register({ secret: SECRET }),
        MessagingModule, // RABBITMQ_URL unset → relay and fan-out stay off
        RealtimeModule,
      ],
      // The application's real global guards, to prove they don't break sockets.
      providers: [
        { provide: UsersService, useValue: users },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ApprovalGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(UsersService)
      .useValue(users)
      .compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new RealtimeIoAdapter(app, [ORIGIN]));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    jwt = module.get(JwtService);
    gateway = module.get(RealtimeGateway);
  });

  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });
  afterAll(async () => {
    await app?.close();
  });

  async function connect(userId?: string, origin = ORIGIN): Promise<Socket> {
    const cookie = userId
      ? `access_token=${await jwt.signAsync(
          { sub: userId, email: 'x', role: accounts[userId].role },
          { secret: SECRET },
        )}`
      : undefined;
    const socket = io(url, {
      path: REALTIME_SOCKET_PATH,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { origin, ...(cookie ? { cookie } : {}) },
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    return socket;
  }

  const send = (socket: Socket, event: string, body: unknown) =>
    socket.timeout(2000).emitWithAck(event, body);

  const update: RealtimeParcelUpdateV1 = {
    version: 1,
    eventId: 'e1',
    parcelId: PARCEL,
    trackingNumber: TRACKING,
    status: 'OUT_FOR_DELIVERY',
    previousStatus: 'IN_TRANSIT',
    occurredAt: '2026-11-22T08:00:00.000Z',
    sequence: 4,
  };
  const publicUpdate: PublicRealtimeParcelUpdateV1 = {
    version: 1,
    trackingNumber: TRACKING,
    status: 'OUT_FOR_DELIVERY',
    occurredAt: update.occurredAt,
    sequence: 4,
  };

  /** Resolves with what arrived within `ms` for an event name. */
  function collect(socket: Socket, event: string, ms = 300) {
    const received: unknown[] = [];
    socket.on(event, (payload: unknown) => received.push(payload));
    return () =>
      new Promise<unknown[]>((r) => setTimeout(() => r(received), ms));
  }

  it('refuses connections from an origin that is not allowed', async () => {
    await expect(connect(undefined, 'https://evil.example')).rejects.toThrow();
  });

  it('lets anonymous clients follow a secure public tracking number only', async () => {
    const socket = await connect();
    await expect(
      send(socket, 'subscribe', {
        scope: 'public',
        trackingNumber: TRACKING.toLowerCase(),
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      send(socket, 'subscribe', {
        scope: 'public',
        trackingNumber: 'SD-DEMO-2004',
      }),
    ).resolves.toEqual({ ok: false, code: 'INVALID_REQUEST' });
    await expect(
      send(socket, 'subscribe', { scope: 'parcel', parcelId: PARCEL }),
    ).resolves.toEqual({ ok: false, code: 'UNAUTHENTICATED' });
  });

  it("lets a customer watch their own parcel, but not someone else's", async () => {
    const owner = await connect(CUSTOMER);
    await expect(
      send(owner, 'subscribe', { scope: 'parcel', parcelId: PARCEL }),
    ).resolves.toEqual({ ok: true });

    const other = await connect(OTHER_CUSTOMER);
    await expect(
      send(other, 'subscribe', { scope: 'parcel', parcelId: PARCEL }),
    ).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('treats an unapproved account like an anonymous one', async () => {
    const socket = await connect(PENDING_MERCHANT);
    await expect(
      send(socket, 'subscribe', { scope: 'parcel', parcelId: PARCEL }),
    ).resolves.toEqual({ ok: false, code: 'UNAUTHENTICATED' });
  });

  it.each([
    ['not an object', 'hello'],
    ['unknown scope', { scope: 'everything' }],
    ['bad parcel id', { scope: 'parcel', parcelId: '../etc' }],
  ])('rejects an invalid request (%s)', async (_name, body) => {
    const socket = await connect(CUSTOMER);
    await expect(send(socket, 'subscribe', body)).resolves.toEqual({
      ok: false,
      code: 'INVALID_REQUEST',
    });
  });

  it('delivers updates only to sockets allowed to see them', async () => {
    const owner = await connect(CUSTOMER);
    await send(owner, 'subscribe', { scope: 'parcel', parcelId: PARCEL });
    const merchant = await connect(MERCHANT); // joins merchant:{id} on connect
    const stranger = await connect(OTHER_CUSTOMER);
    const anonymous = await connect();
    await send(anonymous, 'subscribe', {
      scope: 'public',
      trackingNumber: TRACKING,
    });

    const ownerGot = collect(owner, 'parcel.updated');
    const merchantGot = collect(merchant, 'parcel.updated');
    const strangerGot = collect(stranger, 'parcel.updated');
    const strangerPublic = collect(stranger, 'public.parcel.updated');
    const anonymousPrivate = collect(anonymous, 'parcel.updated');
    const anonymousGot = collect(anonymous, 'public.parcel.updated');

    gateway.broadcast(update, publicUpdate, {
      merchantId: MERCHANT,
      courierId: null,
    });

    expect(await ownerGot()).toEqual([update]);
    expect(await merchantGot()).toEqual([update]);
    expect(await strangerGot()).toEqual([]);
    expect(await strangerPublic()).toEqual([]);
    expect(await anonymousPrivate()).toEqual([]);
    const [publicPayload] = (await anonymousGot()) as Record<string, unknown>[];
    expect(publicPayload).toEqual(publicUpdate);
    expect(publicPayload).not.toHaveProperty('parcelId');
  });

  it('sends one copy to a socket that is in several matching rooms', async () => {
    const owner = await connect(CUSTOMER);
    await send(owner, 'subscribe', { scope: 'parcel', parcelId: PARCEL });
    await send(owner, 'subscribe', { scope: 'parcel', parcelId: PARCEL });
    const got = collect(owner, 'parcel.updated');
    gateway.broadcast(update, publicUpdate, {
      merchantId: null,
      courierId: null,
    });
    expect(await got()).toHaveLength(1);
  });

  it('stops delivering after unsubscribe', async () => {
    const anonymous = await connect();
    await send(anonymous, 'subscribe', {
      scope: 'public',
      trackingNumber: TRACKING,
    });
    await expect(
      send(anonymous, 'unsubscribe', {
        scope: 'public',
        trackingNumber: TRACKING,
      }),
    ).resolves.toEqual({ ok: true });
    const got = collect(anonymous, 'public.parcel.updated');
    gateway.broadcast(update, publicUpdate, {
      merchantId: null,
      courierId: null,
    });
    expect(await got()).toEqual([]);
  });

  it('limits how many rooms one socket can follow', async () => {
    const socket = await connect();
    const hex = (n: number) => n.toString(16).toUpperCase().padStart(32, '0');
    for (let i = 0; i < 20; i++) {
      await expect(
        send(socket, 'subscribe', {
          scope: 'public',
          trackingNumber: `SD-${hex(i)}`,
        }),
      ).resolves.toEqual({ ok: true });
    }
    await expect(
      send(socket, 'subscribe', {
        scope: 'public',
        trackingNumber: `SD-${hex(99)}`,
      }),
    ).resolves.toEqual({ ok: false, code: 'TOO_MANY_SUBSCRIPTIONS' });
  });
});
