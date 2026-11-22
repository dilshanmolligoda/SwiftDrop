/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest mock call arguments are typed `any` */
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { ConsumeMessage } from 'amqplib';
import { Role } from '../../generated/prisma/enums.js';
import type { MessagingConfig } from '../../infrastructure/messaging/messaging.config.js';
import type { RabbitMqPublisher } from '../../infrastructure/messaging/rabbitmq.publisher.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { UsersService } from '../users/users.service.js';
import { ParcelAccessService } from './parcel-access.service.js';
import { RealtimeAuthService } from './realtime-auth.service.js';
import { RealtimeFanoutService } from './realtime-fanout.service.js';
import type { RealtimeGateway } from './realtime.gateway.js';

const SECRET = 'unit-test-secret-that-is-at-least-32-bytes';
const USER = '22222222-2222-4222-8222-222222222222';
const PARCEL = '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b';

describe('RealtimeAuthService', () => {
  const jwt = new JwtService({ secret: SECRET });
  const config = {
    getOrThrow: () => SECRET,
  } as unknown as ConfigService;

  function service(account: Record<string, unknown> | null) {
    const users = { findById: jest.fn().mockResolvedValue(account) };
    return new RealtimeAuthService(
      jwt,
      config,
      users as unknown as UsersService,
    );
  }
  const active = {
    id: USER,
    email: 'c@example.test',
    role: Role.CUSTOMER,
    isActive: true,
    approvalStatus: 'APPROVED',
  };
  const token = (payload: object = { sub: USER, role: Role.CUSTOMER }) =>
    jwt.signAsync(payload, { expiresIn: '15m' });

  it('reads the access-token cookie', async () => {
    const identity = await service(active).identify({
      headers: { cookie: `other=1; access_token=${await token()}` },
    });
    expect(identity?.user).toMatchObject({ id: USER, role: Role.CUSTOMER });
    expect(identity?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('accepts auth.token for non-browser clients', async () => {
    const identity = await service(active).identify({
      headers: {},
      auth: { token: `Bearer ${await token()}` },
    });
    expect(identity?.user.id).toBe(USER);
  });

  it('uses the live role from the database, not the token claim', async () => {
    const identity = await service(active).identify({
      headers: {},
      auth: { token: await token({ sub: USER, role: Role.ADMIN }) },
    });
    expect(identity?.user.role).toBe(Role.CUSTOMER);
  });

  it.each([
    ['no credentials', () => Promise.resolve({ headers: {} })],
    [
      'a forged token',
      async () => ({
        headers: {},
        auth: {
          token: await new JwtService({ secret: 'x'.repeat(40) }).signAsync({
            sub: USER,
            role: Role.ADMIN,
          }),
        },
      }),
    ],
    [
      'an expired token',
      async () => ({
        headers: {},
        auth: {
          token: await jwt.signAsync(
            { sub: USER, role: Role.CUSTOMER, exp: 1 },
            {},
          ),
        },
      }),
    ],
  ])('treats %s as anonymous', async (_name, handshake) => {
    await expect(
      service(active).identify(await handshake()),
    ).resolves.toBeNull();
  });

  it.each([
    ['deleted', null],
    ['deactivated', { ...active, isActive: false }],
    ['not approved', { ...active, approvalStatus: 'PENDING' }],
  ])('treats a %s account as anonymous', async (_name, account) => {
    await expect(
      service(account).identify({
        headers: {},
        auth: { token: await token() },
      }),
    ).resolves.toBeNull();
  });
});

describe('ParcelAccessService', () => {
  function access(found = true) {
    const prisma = {
      parcel: {
        findFirst: jest.fn().mockResolvedValue(found ? { id: PARCEL } : null),
      },
    };
    return {
      service: new ParcelAccessService(prisma as unknown as PrismaService),
      findFirst: prisma.parcel.findFirst,
    };
  }
  const user = (role: Role) => ({ id: USER, email: 'x', role });

  it.each([
    [Role.CUSTOMER, { id: PARCEL, customerId: USER }],
    [Role.MERCHANT, { id: PARCEL, merchantOrder: { merchantUserId: USER } }],
    [
      Role.COURIER,
      {
        id: PARCEL,
        assignments: { some: { courierId: USER, endedAt: null } },
      },
    ],
    [Role.DISPATCHER, { id: PARCEL }],
    [Role.ADMIN, { id: PARCEL }],
  ])('scopes %s to the parcels they may read', async (role, where) => {
    const { service, findFirst } = access();
    await expect(service.canWatch(user(role), PARCEL)).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({ where, select: { id: true } });
  });

  it('answers false when nothing matches', async () => {
    const { service } = access(false);
    await expect(service.canWatch(user(Role.CUSTOMER), PARCEL)).resolves.toBe(
      false,
    );
  });
});

describe('RealtimeFanoutService', () => {
  const config: MessagingConfig = {
    enabled: true,
    url: 'amqp://x',
    exchange: 'parcel.events',
    pollIntervalMs: 1000,
    batchSize: 50,
    publishTimeoutMs: 5000,
    instanceId: 'api-1',
  };

  function fanout() {
    const gateway = { broadcast: jest.fn() };
    const publisher = { openChannel: jest.fn().mockReturnValue(null) };
    return {
      service: new RealtimeFanoutService(
        publisher as unknown as RabbitMqPublisher,
        gateway as unknown as RealtimeGateway,
        config,
      ),
      gateway,
      publisher,
    };
  }
  const message = (body: unknown) =>
    ({ content: Buffer.from(JSON.stringify(body)) }) as ConsumeMessage;

  it('opens its own queue when messaging is on', () => {
    const { service, publisher } = fanout();
    service.onApplicationBootstrap();
    expect(publisher.openChannel).toHaveBeenCalledWith(
      'realtime-fanout',
      expect.any(Function),
    );
  });

  it('broadcasts a valid event with its merchant and courier routing', () => {
    const { service, gateway } = fanout();
    service.onMessage(
      message({
        eventId: '6f1c2c8e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
        eventType: 'parcel.status.changed',
        version: 1,
        occurredAt: '2026-11-22T08:00:00.000Z',
        parcelId: PARCEL,
        trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
        merchantId: '66666666-6666-4666-8666-666666666666',
        courierId: '11111111-1111-4111-8111-111111111111',
        sequence: 7,
        previousStatus: 'PICKED_UP',
        newStatus: 'IN_TRANSIT',
        failureReason: null,
      }),
    );
    const [update, publicUpdate, routing] = gateway.broadcast.mock.calls[0];
    expect(update).toMatchObject({
      parcelId: PARCEL,
      status: 'IN_TRANSIT',
      sequence: 7,
    });
    expect(publicUpdate).not.toHaveProperty('parcelId');
    expect(routing).toEqual({
      merchantId: '66666666-6666-4666-8666-666666666666',
      courierId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('ignores invalid messages and empty deliveries', () => {
    const { service, gateway } = fanout();
    service.onMessage(message({ hello: 'world' }));
    service.onMessage(null);
    expect(gateway.broadcast).not.toHaveBeenCalled();
  });
});
