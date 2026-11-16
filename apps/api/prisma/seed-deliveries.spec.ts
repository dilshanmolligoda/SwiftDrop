/**
 * Database-free checks for the demo delivery seed.
 * Run from apps/api: npx jest --rootDir . prisma/seed-deliveries.spec.ts
 */
import {
  ParcelStatus,
  type PrismaClient,
} from '../src/generated/prisma/client.js';
import {
  DEMO_PARCELS,
  buildDemoDeliveryPlan,
  expectedCourierDashboard,
  getColomboDayRange,
  getStatusChain,
  seedDemoDeliveries,
  seedUuid,
  type DemoUserIds,
} from './seed-deliveries.js';

const USERS: DemoUserIds = {
  dispatcherId: '00000000-0000-4000-8000-0000000000d1',
  merchantId: '00000000-0000-4000-8000-0000000000e1',
  courier1Id: '00000000-0000-4000-8000-0000000000c1',
  courier2Id: '00000000-0000-4000-8000-0000000000c2',
};

const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Colombo is UTC+05:30, so 18:30Z is Colombo midnight.
const SAMPLE_TIMES = {
  middayColombo: new Date('2026-11-03T06:30:00.000Z'),
  justAfterMidnight: new Date('2026-11-02T18:35:00.000Z'),
  justBeforeMidnight: new Date('2026-11-03T18:29:00.000Z'),
  utcPreviousDay: new Date('2026-11-02T20:00:00.000Z'),
};

describe('getColomboDayRange', () => {
  it('uses the Asia/Colombo calendar day', () => {
    expect(getColomboDayRange(new Date('2026-11-03T18:29:59.999Z'))).toEqual({
      date: '2026-11-03',
      start: new Date('2026-11-02T18:30:00.000Z'),
      end: new Date('2026-11-03T18:30:00.000Z'),
    });
    expect(getColomboDayRange(new Date('2026-11-03T18:30:00.000Z')).date).toBe(
      '2026-11-04',
    );
  });
});

describe('seedUuid', () => {
  it('is deterministic and a valid UUID', () => {
    expect(seedUuid('parcel:SD-DEMO-1001')).toBe(
      seedUuid('parcel:SD-DEMO-1001'),
    );
    expect(seedUuid('parcel:SD-DEMO-1001')).toMatch(UUID_V5);
    expect(seedUuid('a')).not.toBe(seedUuid('b'));
  });
});

describe('getStatusChain', () => {
  it('follows the courier transition order', () => {
    expect(getStatusChain(ParcelStatus.DELIVERED)).toEqual([
      'CREATED',
      'ASSIGNED',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
    expect(getStatusChain(ParcelStatus.FAILED).slice(-2)).toEqual([
      'OUT_FOR_DELIVERY',
      'FAILED',
    ]);
    expect(getStatusChain(ParcelStatus.ASSIGNED)).toEqual([
      'CREATED',
      'ASSIGNED',
    ]);
  });
});

describe.each(Object.entries(SAMPLE_TIMES))(
  'buildDemoDeliveryPlan at %s',
  (_label, now) => {
    const plan = buildDemoDeliveryPlan(now, USERS);
    const { start, end } = getColomboDayRange(now);

    it('is deterministic across runs', () => {
      expect(buildDemoDeliveryPlan(now, USERS)).toEqual(plan);
    });

    it('covers every courier-facing status for courier1', () => {
      const statuses = new Set(
        plan.parcels
          .filter((p) => p.definition.courier === 'courier1')
          .map((p) => p.parcel.status),
      );
      for (const status of [
        'ASSIGNED',
        'PICKED_UP',
        'IN_TRANSIT',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'FAILED',
      ]) {
        expect(statuses).toContain(status);
      }
    });

    it('uses unique IDs and tracking numbers', () => {
      const ids = plan.parcels.flatMap((p) => [
        p.parcel.id,
        ...p.assignments.map((a) => a.id),
        ...p.events.map((e) => e.id),
        ...(p.proof ? [p.proof.id] : []),
      ]);
      expect(new Set(ids).size).toBe(ids.length);
      ids.forEach((id) => expect(id).toMatch(UUID_V5));
      const tracking = plan.parcels.map((p) => p.parcel.trackingNumber);
      expect(new Set(tracking).size).toBe(tracking.length);
      tracking.forEach((t) => expect(t).toMatch(/^SD-DEMO-\d{4}$/));
    });

    it.each(DEMO_PARCELS.map((d) => d.code))(
      'parcel %s satisfies schema constraints',
      (code) => {
        const p = plan.parcels.find((x) => x.definition.code === code)!;
        const active = p.assignments.filter((a) => a.endedAt === null);
        const assignmentIds = new Set(p.assignments.map((a) => a.id));

        // One active assignment per parcel (partial unique index).
        expect(active).toHaveLength(1);
        p.assignments.forEach((a) => {
          expect(a.parcelId).toBe(p.parcel.id);
          expect(a.assignedById).toBe(USERS.dispatcherId);
          if (a.endedAt) expect(a.endedAt >= a.assignedAt).toBe(true);
        });

        // Last event matches the parcel status.
        expect(p.events.at(-1)!.status).toBe(p.parcel.status);
        expect(p.events[0].status).toBe('CREATED');

        // Events are chronological, never in the future, and FK-consistent.
        p.events.forEach((e, i) => {
          expect(e.parcelId).toBe(p.parcel.id);
          expect(e.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
          if (i > 0) {
            expect(e.createdAt.getTime()).toBeGreaterThanOrEqual(
              p.events[i - 1].createdAt.getTime(),
            );
          }
          if (e.assignmentId) expect(assignmentIds).toContain(e.assignmentId);
          // FAILED requires a reason (CHECK constraint); others never carry one.
          if (e.status === 'FAILED') expect(e.failureReason).toBeTruthy();
          else expect(e.failureReason).toBeNull();
        });

        // Courier events are by the active courier on the active assignment.
        p.events
          .filter((e) => !['CREATED', 'ASSIGNED'].includes(e.status))
          .forEach((e) => {
            expect(e.actorId).toBe(active[0].courierId);
            expect(e.assignmentId).toBe(active[0].id);
          });

        // DELIVERED requires a proof for the same parcel/assignment/courier.
        if (p.parcel.status === 'DELIVERED') {
          expect(p.proof).not.toBeNull();
          expect(p.proof!.parcelId).toBe(p.parcel.id);
          expect(p.proof!.assignmentId).toBe(active[0].id);
          expect(p.proof!.courierId).toBe(active[0].courierId);
          expect(p.proof!.sizeBytes).toBeGreaterThan(0);
          expect(p.events.at(-1)!.proofId).toBe(p.proof!.id);
        } else {
          expect(p.proof).toBeNull();
          p.events.forEach((e) => expect(e.proofId).toBeNull());
        }

        // Colombo-day placement.
        const timing = p.definition.timing ?? 'today';
        const assignedAt = active[0].assignedAt.getTime();
        if (timing === 'yesterday') {
          expect(assignedAt).toBeLessThan(start.getTime());
        } else {
          expect(assignedAt).toBeGreaterThanOrEqual(start.getTime());
          expect(assignedAt).toBeLessThan(end.getTime());
          expect(assignedAt).toBeLessThanOrEqual(now.getTime());
        }
        if (timing === 'midnight') expect(assignedAt).toBe(start.getTime());
      },
    );

    it('yields the documented dashboard counts', () => {
      expect(expectedCourierDashboard(plan, USERS.courier1Id, now)).toEqual({
        totalAssigned: 15,
        pending: 4,
        pickedUp: 2,
        inTransit: 2,
        outForDelivery: 3,
        delivered: 2,
        failed: 2,
      });
      expect(
        expectedCourierDashboard(plan, USERS.courier2Id, now).totalAssigned,
      ).toBe(4);
    });
  },
);

// ------------------------------------------------------------------
// Idempotency and write order, using an in-memory fake client
// ------------------------------------------------------------------

interface StoredParcel {
  id: string;
  assignments: { assignedAt: Date }[];
}

function createFakePrisma(store = new Map<string, StoredParcel>()) {
  const calls: string[] = [];
  const pendingAssignments = new Map<string, { assignedAt: Date }[]>();
  const tx = {
    parcel: {
      findUnique: ({ where }: { where: { trackingNumber: string } }) =>
        Promise.resolve(store.get(where.trackingNumber) ?? null),
      create: ({
        data,
      }: {
        data: { id: string; trackingNumber: string; status: string };
      }) => {
        calls.push(`parcel.create ${data.trackingNumber} ${data.status}`);
        const assignments: { assignedAt: Date }[] = [];
        pendingAssignments.set(data.id, assignments);
        store.set(data.trackingNumber, { id: data.id, assignments });
        return Promise.resolve(data);
      },
      update: ({ data }: { data: { status: string } }) => {
        calls.push(`parcel.update ${data.status}`);
        return Promise.resolve(data);
      },
      delete: ({ where }: { where: { id: string } }) => {
        calls.push('parcel.delete');
        for (const [key, value] of store) {
          if (value.id === where.id) store.delete(key);
        }
        return Promise.resolve(null);
      },
    },
    deliveryAssignment: {
      create: ({
        data,
      }: {
        data: { parcelId: string; assignedAt: Date; endedAt: Date | null };
      }) => {
        calls.push('assignment.create');
        if (!data.endedAt)
          pendingAssignments
            .get(data.parcelId)
            ?.push({ assignedAt: data.assignedAt });
        return Promise.resolve(data);
      },
      deleteMany: () => {
        calls.push('assignment.deleteMany');
        return Promise.resolve({ count: 1 });
      },
    },
    deliveryProof: {
      create: (args: unknown) => {
        calls.push('proof.create');
        return Promise.resolve(args);
      },
      deleteMany: () => {
        calls.push('proof.deleteMany');
        return Promise.resolve({ count: 0 });
      },
    },
    parcelStatusEvent: {
      createMany: ({ data }: { data: unknown[] }) => {
        calls.push(`events.createMany ${data.length}`);
        return Promise.resolve({ count: data.length });
      },
      deleteMany: () => {
        calls.push('events.deleteMany');
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const prisma = {
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaClient;
  return { prisma, calls, store };
}

describe('seedDemoDeliveries (fake client)', () => {
  const now = SAMPLE_TIMES.middayColombo;
  const silent = () => undefined;

  it('creates every demo parcel on the first run', async () => {
    const { prisma, calls } = createFakePrisma();
    const result = await seedDemoDeliveries(prisma, USERS, {
      now,
      log: silent,
    });
    expect(result).toMatchObject({
      created: DEMO_PARCELS.length,
      reset: 0,
      skipped: 0,
      colomboDate: '2026-11-03',
    });
    expect(calls.filter((c) => c.startsWith('parcel.create'))).toHaveLength(
      DEMO_PARCELS.length,
    );
  });

  it('writes nothing on a second run (idempotent)', async () => {
    const { prisma, calls } = createFakePrisma();
    await seedDemoDeliveries(prisma, USERS, { now, log: silent });
    calls.length = 0;
    const result = await seedDemoDeliveries(prisma, USERS, {
      now,
      log: silent,
    });
    expect(result).toMatchObject({
      created: 0,
      reset: 0,
      skipped: DEMO_PARCELS.length,
    });
    expect(result.staleParcels).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('reports parcels left on an earlier day without changing them', async () => {
    const { prisma, calls } = createFakePrisma();
    await seedDemoDeliveries(prisma, USERS, { now, log: silent });
    calls.length = 0;
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const result = await seedDemoDeliveries(prisma, USERS, {
      now: tomorrow,
      log: silent,
    });
    expect(result.staleParcels.length).toBe(DEMO_PARCELS.length - 1);
    expect(calls).toEqual([]);
  });

  it('creates a delivered parcel before its proof, then promotes it', async () => {
    const { prisma, calls } = createFakePrisma();
    await seedDemoDeliveries(prisma, USERS, { now, log: silent });
    const start = calls.indexOf('parcel.create SD-DEMO-1011 OUT_FOR_DELIVERY');
    expect(calls.slice(start, start + 5)).toEqual([
      'parcel.create SD-DEMO-1011 OUT_FOR_DELIVERY',
      'assignment.create',
      'proof.create',
      'events.createMany 6',
      'parcel.update DELIVERED',
    ]);
  });

  it('reset deletes dependents in FK-safe order before recreating', async () => {
    const { prisma, calls } = createFakePrisma();
    await seedDemoDeliveries(prisma, USERS, { now, log: silent });
    calls.length = 0;
    const result = await seedDemoDeliveries(prisma, USERS, {
      now,
      reset: true,
      log: silent,
    });
    expect(result.reset).toBe(DEMO_PARCELS.length);
    expect(calls.slice(0, 6)).toEqual([
      'parcel.update CREATED',
      'events.deleteMany',
      'proof.deleteMany',
      'assignment.deleteMany',
      'parcel.delete',
      'parcel.create SD-DEMO-1001 ASSIGNED',
    ]);
  });

  it('never touches a non-seed parcel that reuses a demo tracking number', async () => {
    const store = new Map<string, StoredParcel>([
      [
        'SD-DEMO-1001',
        { id: '99999999-9999-4999-8999-999999999999', assignments: [] },
      ],
    ]);
    const { prisma, calls } = createFakePrisma(store);
    const result = await seedDemoDeliveries(prisma, USERS, {
      now,
      reset: true,
      log: silent,
    });
    expect(result.skipped).toBe(1);
    expect(calls.some((c) => c.includes('SD-DEMO-1001'))).toBe(false);
    expect(calls[0]).not.toBe('parcel.update CREATED');
  });
});
