import { createHash } from 'node:crypto';
import {
  DeliveryFailureReason,
  MerchantOrderStatus,
  ParcelStatus,
  type PrismaClient,
} from '../src/generated/prisma/client.js';

/**
 * Development-only courier delivery fixtures.
 *
 * - Every record has a deterministic ID derived from its tracking number, so
 *   re-running the seed never creates duplicates.
 * - "Today" follows the courier API: the Asia/Colombo calendar day (UTC+05:30,
 *   no daylight saving).
 * - Default mode only creates missing parcels. `--reset-demo-deliveries`
 *   rebuilds the SD-DEMO-* parcels (and anything recorded against them during
 *   testing) so assignment dates move to the current Colombo day.
 */

export const COLOMBO_TIME_ZONE = 'Asia/Colombo';
const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;
export const DEMO_TRACKING_PREFIX = 'SD-DEMO-';
/* Demo parcels are registered by the demo merchant (see the CREATED event). */
const DEMO_SENDER_NAME = 'SwiftDrop Demo Merchant';
const DEMO_SENDER_ADDRESS = '120 Union Place, Colombo 02';
/** Used when a demo parcel has no recorded weight. */
const DEMO_DEFAULT_WEIGHT_KG = 1;
const DEMO_COST_LKR = 450;

function mapParcelStatusToMerchantOrderStatus(
  status: ParcelStatus,
): MerchantOrderStatus {
  switch (status) {
    case ParcelStatus.PICKED_UP:
      return MerchantOrderStatus.PICKED_UP;
    case ParcelStatus.IN_TRANSIT:
      return MerchantOrderStatus.IN_TRANSIT;
    case ParcelStatus.OUT_FOR_DELIVERY:
      return MerchantOrderStatus.OUT_FOR_DELIVERY;
    case ParcelStatus.DELIVERED:
      return MerchantOrderStatus.DELIVERED;
    case ParcelStatus.FAILED:
      return MerchantOrderStatus.DELIVERY_FAILED;
    default:
      return MerchantOrderStatus.AWAITING_PICKUP;
  }
}

export interface DemoUserIds {
  readonly dispatcherId: string;
  readonly merchantId: string;
  readonly courier1Id: string;
  readonly courier2Id: string;
}

type CourierKey = 'courier1' | 'courier2';
/** today = spread over today; midnight = exactly 00:00 Colombo; yesterday = 23:59 the day before. */
type Timing = 'today' | 'midnight' | 'yesterday';

interface DemoParcelDefinition {
  readonly code: string;
  readonly courier: CourierKey;
  readonly status: ParcelStatus;
  readonly purpose: string;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly recipientAddress: string;
  readonly deliveryInstructions: string | null;
  readonly contentsDescription: string | null;
  readonly weightGrams: number | null;
  readonly timing?: Timing;
  readonly failure?: {
    readonly reason: DeliveryFailureReason;
    readonly note: string;
  };
  /** Previously assigned to this courier earlier today, then reassigned. */
  readonly reassignedFrom?: CourierKey;
}

/* Fictional recipients; phone numbers use the Sri Lankan mobile format. */
export const DEMO_PARCELS: readonly DemoParcelDefinition[] = [
  // ---- courier1: active assignments today ----
  {
    code: '1001',
    courier: 'courier1',
    status: ParcelStatus.ASSIGNED,
    purpose: 'Scenario C: walk the full status chain',
    recipientName: 'Nimal Perera',
    recipientPhone: '+94 77 214 5583',
    recipientAddress: '42 Galle Road, Colombo 03',
    deliveryInstructions: 'Call on arrival. Gate code 2741.',
    contentsDescription: 'Mobile phone accessories',
    weightGrams: 420,
  },
  {
    code: '1002',
    courier: 'courier1',
    status: ParcelStatus.ASSIGNED,
    purpose: 'Pending pickup',
    recipientName: 'Fathima Rizwan',
    recipientPhone: '+94 71 839 2210',
    recipientAddress: '18/2 Kandy Road, Kiribathgoda',
    deliveryInstructions: null,
    contentsDescription: 'Books',
    weightGrams: 1850,
  },
  {
    code: '1003',
    courier: 'courier1',
    status: ParcelStatus.ASSIGNED,
    purpose: 'Pending pickup with apartment instructions',
    recipientName: 'Kasun Jayawardena',
    recipientPhone: '+94 76 402 7719',
    recipientAddress: 'Flat 7B, Tower 2, Havelock City, Colombo 05',
    deliveryInstructions: 'Leave at the reception desk if not answering.',
    contentsDescription: 'Kitchen appliance',
    weightGrams: 3200,
  },
  {
    code: '1004',
    courier: 'courier1',
    status: ParcelStatus.PICKED_UP,
    purpose: 'Picked up',
    recipientName: 'Ayesha Fernando',
    recipientPhone: '+94 72 655 0194',
    recipientAddress: '112 Negombo Road, Wattala',
    deliveryInstructions: null,
    contentsDescription: 'Clothing',
    weightGrams: 760,
  },
  {
    code: '1005',
    courier: 'courier1',
    status: ParcelStatus.PICKED_UP,
    purpose: 'Picked up',
    recipientName: 'Ruwan Silva',
    recipientPhone: '+94 70 318 4462',
    recipientAddress: '9 Temple Lane, Nugegoda',
    deliveryInstructions: 'Back entrance via the side lane.',
    contentsDescription: null,
    weightGrams: null,
  },
  {
    code: '1006',
    courier: 'courier1',
    status: ParcelStatus.IN_TRANSIT,
    purpose: 'In transit',
    recipientName: 'Dilani Wickramasinghe',
    recipientPhone: '+94 77 590 3381',
    recipientAddress: '27 Station Road, Dehiwala',
    deliveryInstructions: 'Fragile: handle with care.',
    contentsDescription: 'Glassware set',
    weightGrams: 2400,
  },
  {
    code: '1007',
    courier: 'courier1',
    status: ParcelStatus.IN_TRANSIT,
    purpose: 'In transit',
    recipientName: 'Tharindu Bandara',
    recipientPhone: '+94 75 126 9047',
    recipientAddress: '5 Lake Drive, Rajagiriya',
    deliveryInstructions: null,
    contentsDescription: 'Laptop sleeve',
    weightGrams: 380,
  },
  {
    code: '1008',
    courier: 'courier1',
    status: ParcelStatus.OUT_FOR_DELIVERY,
    purpose: 'Scenario D: upload proof and complete delivery',
    recipientName: 'Shanika Gunasekara',
    recipientPhone: '+94 71 774 6620',
    recipientAddress: '63 Old Kottawa Road, Maharagama',
    deliveryInstructions: 'Recipient works from home; ring the bell twice.',
    contentsDescription: 'Cosmetics',
    weightGrams: 540,
  },
  {
    code: '1009',
    courier: 'courier1',
    status: ParcelStatus.OUT_FOR_DELIVERY,
    purpose: 'Scenario E: report a failed delivery',
    recipientName: 'Mohamed Imran',
    recipientPhone: '+94 77 931 2258',
    recipientAddress: '14 Mosque Lane, Dematagoda, Colombo 09',
    deliveryInstructions: null,
    contentsDescription: 'Shoes',
    weightGrams: 1100,
  },
  {
    code: '1010',
    courier: 'courier1',
    status: ParcelStatus.OUT_FOR_DELIVERY,
    purpose: 'Scenario G: attempt delivery without proof',
    recipientName: 'Sanduni Rathnayake',
    recipientPhone: '+94 76 285 1137',
    recipientAddress: '201 High Level Road, Kottawa',
    deliveryInstructions: 'Hand over to the security guard only with ID.',
    contentsDescription: 'Documents',
    weightGrams: 150,
  },
  {
    code: '1011',
    courier: 'courier1',
    status: ParcelStatus.DELIVERED,
    purpose: 'Delivered with proof',
    recipientName: 'Pradeep Kumara',
    recipientPhone: '+94 70 642 8815',
    recipientAddress: '33 Baseline Road, Borella, Colombo 08',
    deliveryInstructions: null,
    contentsDescription: 'Headphones',
    weightGrams: 610,
  },
  {
    code: '1012',
    courier: 'courier1',
    status: ParcelStatus.DELIVERED,
    purpose: 'Delivered with proof',
    recipientName: 'Nadeesha Herath',
    recipientPhone: '+94 72 508 3346',
    recipientAddress: '8 Park Avenue, Mount Lavinia',
    deliveryInstructions: 'Leave with the neighbour at No. 10 if out.',
    contentsDescription: 'Toys',
    weightGrams: 1320,
  },
  {
    code: '1013',
    courier: 'courier1',
    status: ParcelStatus.FAILED,
    purpose: 'Failed: recipient unavailable',
    recipientName: 'Chamara Dissanayake',
    recipientPhone: '+94 77 116 4093',
    recipientAddress: '71 Hospital Road, Kalubowila',
    deliveryInstructions: null,
    contentsDescription: 'Supplements',
    weightGrams: 900,
    failure: {
      reason: DeliveryFailureReason.RECIPIENT_UNAVAILABLE,
      note: 'Called twice and knocked; nobody home. Notice card left.',
    },
  },
  {
    code: '1014',
    courier: 'courier1',
    status: ParcelStatus.FAILED,
    purpose: 'Failed: incorrect address',
    recipientName: 'Hiruni Senanayake',
    recipientPhone: '+94 71 367 9952',
    recipientAddress: '120/5 Cotta Road, Rajagiriya',
    deliveryInstructions: null,
    contentsDescription: 'Stationery',
    weightGrams: 480,
    failure: {
      reason: DeliveryFailureReason.INCORRECT_ADDRESS,
      note: 'House number 120/5 does not exist on Cotta Road.',
    },
  },
  {
    code: '1015',
    courier: 'courier1',
    status: ParcelStatus.ASSIGNED,
    timing: 'midnight',
    purpose: 'Scenario J: assigned at exactly 00:00 Colombo (counts as today)',
    recipientName: 'Lakmal Weerasinghe',
    recipientPhone: '+94 75 820 1164',
    recipientAddress: '6 Marine Drive, Wellawatte, Colombo 06',
    deliveryInstructions: null,
    contentsDescription: 'Spare parts',
    weightGrams: 2750,
  },
  {
    code: '1016',
    courier: 'courier1',
    status: ParcelStatus.ASSIGNED,
    timing: 'yesterday',
    purpose:
      'Scenario J: assigned at 23:59 Colombo yesterday (excluded from today)',
    recipientName: 'Ishara Madushani',
    recipientPhone: '+94 70 459 2271',
    recipientAddress: '44 Kandy Road, Kadawatha',
    deliveryInstructions: null,
    contentsDescription: 'Bed linen',
    weightGrams: 1600,
  },
  // ---- courier2: ownership-restriction targets ----
  {
    code: '2001',
    courier: 'courier2',
    status: ParcelStatus.ASSIGNED,
    purpose: 'Scenario F: belongs to courier2',
    recipientName: 'Roshan Peiris',
    recipientPhone: '+94 77 702 5518',
    recipientAddress: '19 Main Street, Panadura',
    deliveryInstructions: null,
    contentsDescription: 'Tools',
    weightGrams: 4100,
  },
  {
    code: '2002',
    courier: 'courier2',
    status: ParcelStatus.OUT_FOR_DELIVERY,
    purpose: 'Scenario F: courier1 must not update, upload proof or fail this',
    recipientName: 'Malini Abeysekara',
    recipientPhone: '+94 71 940 3306',
    recipientAddress: '52 Horana Road, Piliyandala',
    deliveryInstructions: 'Call before arriving.',
    contentsDescription: 'Medicine',
    weightGrams: 300,
  },
  {
    code: '2003',
    courier: 'courier2',
    status: ParcelStatus.DELIVERED,
    purpose: "Scenario F: courier2's delivered parcel",
    recipientName: 'Upul Ranasinghe',
    recipientPhone: '+94 76 513 8840',
    recipientAddress: '3 Beach Road, Moratuwa',
    deliveryInstructions: null,
    contentsDescription: 'Camera lens',
    weightGrams: 870,
  },
  {
    code: '2004',
    courier: 'courier2',
    status: ParcelStatus.PICKED_UP,
    reassignedFrom: 'courier1',
    purpose:
      'Scenario F/J: courier1 assignment ended today, now active for courier2',
    recipientName: 'Sachini Kodikara',
    recipientPhone: '+94 72 271 6639',
    recipientAddress: '88 Kotte Road, Pita Kotte',
    deliveryInstructions: null,
    contentsDescription: 'Handbag',
    weightGrams: 650,
  },
];

const DEFAULT_NOTES: Partial<Record<ParcelStatus, string>> = {
  [ParcelStatus.CREATED]: 'Parcel registered by merchant',
  [ParcelStatus.ASSIGNED]: 'Assigned by dispatch',
  [ParcelStatus.PICKED_UP]: 'Collected from the Colombo sorting hub',
  [ParcelStatus.IN_TRANSIT]: 'Departed hub on the delivery route',
  [ParcelStatus.OUT_FOR_DELIVERY]: "Out for delivery on today's route",
  [ParcelStatus.DELIVERED]: 'Handed to recipient',
};

const STATUS_PATH: readonly ParcelStatus[] = [
  ParcelStatus.PICKED_UP,
  ParcelStatus.IN_TRANSIT,
  ParcelStatus.OUT_FOR_DELIVERY,
];

// ------------------------------------------------------------------
// Pure helpers
// ------------------------------------------------------------------

/** Deterministic RFC 4122 v5-style UUID for a seed record name. */
export function seedUuid(name: string): string {
  const hash = createHash('sha1')
    .update(`swiftdrop-demo-seed:${name}`)
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Colombo calendar day containing `now`, matching CourierService.getColomboDayRange. */
export function getColomboDayRange(now: Date): {
  date: string;
  start: Date;
  end: Date;
} {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: COLOMBO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day) - COLOMBO_OFFSET_MS);
  return { date, start, end: new Date(start.getTime() + DAY_MS) };
}

export function getStatusChain(status: ParcelStatus): ParcelStatus[] {
  if (status === ParcelStatus.CREATED) return [ParcelStatus.CREATED];
  const chain: ParcelStatus[] = [ParcelStatus.CREATED, ParcelStatus.ASSIGNED];
  if (status === ParcelStatus.ASSIGNED) return chain;
  for (const step of STATUS_PATH) {
    chain.push(step);
    if (step === status) return chain;
  }
  // DELIVERED and FAILED both follow OUT_FOR_DELIVERY.
  chain.push(status);
  return chain;
}

// ------------------------------------------------------------------
// Plan
// ------------------------------------------------------------------

export interface PlannedAssignment {
  readonly id: string;
  readonly parcelId: string;
  readonly courierId: string;
  readonly assignedById: string;
  readonly assignedAt: Date;
  readonly endedAt: Date | null;
}

export interface PlannedProof {
  readonly id: string;
  readonly parcelId: string;
  readonly assignmentId: string;
  readonly courierId: string;
  readonly storageProvider: string;
  readonly storageKey: string;
  readonly originalFilename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly uploadedAt: Date;
}

export interface PlannedEvent {
  readonly id: string;
  readonly parcelId: string;
  readonly assignmentId: string | null;
  readonly actorId: string | null;
  readonly proofId: string | null;
  readonly status: ParcelStatus;
  readonly note: string | null;
  readonly failureReason: DeliveryFailureReason | null;
  readonly createdAt: Date;
}

export interface PlannedParcel {
  readonly definition: DemoParcelDefinition;
  readonly parcel: {
    readonly id: string;
    readonly trackingNumber: string;
    readonly customerId: string;
    readonly senderName: string;
    readonly senderAddress: string;
    readonly recipientName: string;
    readonly recipientPhone: string;
    readonly recipientAddress: string;
    readonly deliveryInstructions: string | null;
    readonly contentsDescription: string | null;
    readonly weightKg: number;
    readonly weightGrams: number | null;
    readonly costLkr: number;
    readonly status: ParcelStatus;
    readonly createdAt: Date;
  };
  readonly assignments: readonly PlannedAssignment[];
  readonly proof: PlannedProof | null;
  readonly events: readonly PlannedEvent[];
}

export interface DemoDeliveryPlan {
  readonly colomboDate: string;
  readonly parcels: readonly PlannedParcel[];
}

/**
 * Builds every record for the demo deliveries. Pure: no database access, so
 * it can be unit-tested. All "today" timestamps fall within the current
 * Colombo day and never after `now`.
 */
export function buildDemoDeliveryPlan(
  now: Date,
  users: DemoUserIds,
): DemoDeliveryPlan {
  const { date, start: dayStart } = getColomboDayRange(now);
  const nowMs = now.getTime();
  // Spread today's activity over the last six hours (or since midnight).
  const windowStart = Math.max(
    dayStart.getTime() + 1000,
    nowMs - 6 * 60 * MINUTE_MS,
  );
  const windowMs = Math.max(nowMs - windowStart, 0);
  const courierIds: Record<CourierKey, string> = {
    courier1: users.courier1Id,
    courier2: users.courier2Id,
  };
  const todayDefs = DEMO_PARCELS.filter(
    (d) => (d.timing ?? 'today') === 'today',
  );

  const parcels = DEMO_PARCELS.map((definition): PlannedParcel => {
    const trackingNumber = `${DEMO_TRACKING_PREFIX}${definition.code}`;
    const parcelId = seedUuid(`parcel:${trackingNumber}`);
    const timing = definition.timing ?? 'today';

    let assignedAtMs: number;
    if (timing === 'midnight') assignedAtMs = dayStart.getTime();
    else if (timing === 'yesterday')
      assignedAtMs = dayStart.getTime() - MINUTE_MS;
    else {
      const index = todayDefs.indexOf(definition);
      // First 60% of the window holds assignments; later events follow them.
      assignedAtMs =
        windowStart + Math.floor((windowMs * 0.6 * index) / todayDefs.length);
    }

    const chain = getStatusChain(definition.status);
    const afterAssignment = chain.slice(2);
    // Later events are spaced evenly between assignment and `now`.
    const spanMs = Math.max(nowMs - assignedAtMs, 0);
    const eventTime = (step: number) =>
      new Date(
        assignedAtMs +
          Math.floor((spanMs * 0.9 * step) / (afterAssignment.length + 1)),
      );

    const assignments: PlannedAssignment[] = [];
    const events: PlannedEvent[] = [];
    const createdAt = new Date(assignedAtMs - 45 * MINUTE_MS);

    events.push({
      id: seedUuid(`event:${trackingNumber}:0:CREATED`),
      parcelId,
      assignmentId: null,
      actorId: users.merchantId,
      proofId: null,
      status: ParcelStatus.CREATED,
      note: DEFAULT_NOTES[ParcelStatus.CREATED] ?? null,
      failureReason: null,
      createdAt,
    });

    const activeCourierId = courierIds[definition.courier];
    let activeAssignedAtMs = assignedAtMs;

    if (definition.reassignedFrom) {
      // Earlier assignment to another courier, ended at the reassignment time.
      const previousId = seedUuid(`assignment:${trackingNumber}:previous`);
      const reassignedAtMs = assignedAtMs + Math.floor(spanMs * 0.3);
      assignments.push({
        id: previousId,
        parcelId,
        courierId: courierIds[definition.reassignedFrom],
        assignedById: users.dispatcherId,
        assignedAt: new Date(assignedAtMs),
        endedAt: new Date(reassignedAtMs),
      });
      events.push({
        id: seedUuid(`event:${trackingNumber}:1:ASSIGNED:previous`),
        parcelId,
        assignmentId: previousId,
        actorId: users.dispatcherId,
        proofId: null,
        status: ParcelStatus.ASSIGNED,
        note: 'Assigned by dispatch',
        failureReason: null,
        createdAt: new Date(assignedAtMs),
      });
      activeAssignedAtMs = reassignedAtMs;
    }

    const assignmentId = seedUuid(`assignment:${trackingNumber}`);
    assignments.push({
      id: assignmentId,
      parcelId,
      courierId: activeCourierId,
      assignedById: users.dispatcherId,
      assignedAt: new Date(activeAssignedAtMs),
      endedAt: null,
    });
    events.push({
      id: seedUuid(`event:${trackingNumber}:1:ASSIGNED`),
      parcelId,
      assignmentId,
      actorId: users.dispatcherId,
      proofId: null,
      status: ParcelStatus.ASSIGNED,
      note: definition.reassignedFrom
        ? 'Reassigned by dispatch to balance route load'
        : (DEFAULT_NOTES[ParcelStatus.ASSIGNED] ?? null),
      failureReason: null,
      createdAt: new Date(activeAssignedAtMs),
    });

    let proof: PlannedProof | null = null;
    afterAssignment.forEach((status, index) => {
      let at = eventTime(index + 1);
      if (at.getTime() <= activeAssignedAtMs)
        at = new Date(activeAssignedAtMs + 1000 * (index + 1));
      let proofId: string | null = null;

      if (status === ParcelStatus.DELIVERED) {
        proofId = seedUuid(`proof:${trackingNumber}`);
        proof = {
          id: proofId,
          parcelId,
          assignmentId,
          courierId: activeCourierId,
          // Metadata-only fixture: no file exists for this key.
          storageProvider: 'seed',
          storageKey: `seed/${proofId}`,
          originalFilename: `doorstep-${trackingNumber.toLowerCase()}.jpg`,
          contentType: 'image/jpeg',
          sizeBytes: 180_000 + Number(definition.code) * 37,
          // Just before the DELIVERED event, after the previous one.
          uploadedAt: new Date(at.getTime() - 1000),
        };
      }

      events.push({
        id: seedUuid(`event:${trackingNumber}:${index + 2}:${status}`),
        parcelId,
        assignmentId,
        actorId: activeCourierId,
        proofId,
        status,
        note:
          status === ParcelStatus.FAILED
            ? (definition.failure?.note ?? null)
            : (DEFAULT_NOTES[status] ?? null),
        failureReason:
          status === ParcelStatus.FAILED
            ? (definition.failure?.reason ?? DeliveryFailureReason.OTHER)
            : null,
        createdAt: at,
      });
    });

    return {
      definition,
      parcel: {
        id: parcelId,
        trackingNumber,
        customerId: users.merchantId,
        senderName: DEMO_SENDER_NAME,
        senderAddress: DEMO_SENDER_ADDRESS,
        recipientName: definition.recipientName,
        recipientPhone: definition.recipientPhone,
        recipientAddress: definition.recipientAddress,
        deliveryInstructions: definition.deliveryInstructions,
        contentsDescription: definition.contentsDescription,
        weightKg:
          definition.weightGrams === null
            ? DEMO_DEFAULT_WEIGHT_KG
            : Math.round(definition.weightGrams / 10) / 100,
        weightGrams: definition.weightGrams,
        costLkr: DEMO_COST_LKR,
        status: definition.status,
        createdAt,
      },
      assignments,
      proof,
      events,
    };
  });

  return { colomboDate: date, parcels };
}

/** Dashboard counts courier1 should see for today's Colombo date after a fresh seed. */
export function expectedCourierDashboard(
  plan: DemoDeliveryPlan,
  courierId: string,
  now: Date,
): Record<string, number> {
  const { start, end } = getColomboDayRange(now);
  const active = plan.parcels.filter((p) =>
    p.assignments.some(
      (a) =>
        a.courierId === courierId &&
        a.endedAt === null &&
        a.assignedAt >= start &&
        a.assignedAt < end,
    ),
  );
  const count = (status: ParcelStatus) =>
    active.filter((p) => p.parcel.status === status).length;
  return {
    totalAssigned: active.length,
    pending: count(ParcelStatus.ASSIGNED),
    pickedUp: count(ParcelStatus.PICKED_UP),
    inTransit: count(ParcelStatus.IN_TRANSIT),
    outForDelivery: count(ParcelStatus.OUT_FOR_DELIVERY),
    delivered: count(ParcelStatus.DELIVERED),
    failed: count(ParcelStatus.FAILED),
  };
}

// ------------------------------------------------------------------
// Database writes
// ------------------------------------------------------------------

export interface SeedDeliveriesOptions {
  readonly now?: Date;
  /** Rebuild existing SD-DEMO-* parcels for the current Colombo day. */
  readonly reset?: boolean;
  readonly log?: (message: string) => void;
}

export interface SeedDeliveriesResult {
  readonly created: number;
  readonly reset: number;
  readonly skipped: number;
  readonly colomboDate: string;
  readonly staleParcels: readonly string[];
}

export async function seedDemoDeliveries(
  prisma: PrismaClient,
  users: DemoUserIds,
  options: SeedDeliveriesOptions = {},
): Promise<SeedDeliveriesResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? ((message: string) => console.log(message));
  const plan = buildDemoDeliveryPlan(now, users);
  const { start: dayStart } = getColomboDayRange(now);
  let created = 0;
  let reset = 0;
  let skipped = 0;
  const staleParcels: string[] = [];

  for (const planned of plan.parcels) {
    const { trackingNumber, id: parcelId } = planned.parcel;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.parcel.findUnique({
        where: { trackingNumber },
        select: {
          id: true,
          assignments: {
            where: { endedAt: null },
            select: { assignedAt: true },
          },
        },
      });

      if (existing && existing.id !== parcelId) {
        // Same tracking number but not created by this seed: never touch it.
        log(
          `[Seed] Skipped ${trackingNumber}: tracking number belongs to a non-seed parcel (${existing.id}).`,
        );
        skipped += 1;
        return;
      }

      if (existing && !options.reset) {
        const isToday =
          planned.definition.timing === 'yesterday' ||
          existing.assignments.some((a) => a.assignedAt >= dayStart);
        if (!isToday) staleParcels.push(trackingNumber);
        skipped += 1;
        return;
      }

      if (existing) {
        // Remove everything recorded for this demo parcel, including test
        // activity. The parcel must leave DELIVERED before its proof is
        // deleted (CHECK constraint + FK to the delivered proof).
        await tx.parcel.update({
          where: { id: parcelId },
          data: { status: ParcelStatus.CREATED, deliveredProofId: null },
        });
        await tx.parcelStatusEvent.deleteMany({ where: { parcelId } });
        await tx.deliveryProof.deleteMany({ where: { parcelId } });
        await tx.deliveryAssignment.deleteMany({ where: { parcelId } });
        await tx.parcel.delete({ where: { id: parcelId } });
      }

      const isDelivered = planned.parcel.status === ParcelStatus.DELIVERED;
      // DELIVERED needs a proof that references the parcel, so the parcel is
      // created one step earlier and promoted after the proof exists.
      await tx.parcel.create({
        data: {
          ...planned.parcel,
          status: isDelivered
            ? ParcelStatus.OUT_FOR_DELIVERY
            : planned.parcel.status,
        },
      });
      for (const assignment of planned.assignments) {
        await tx.deliveryAssignment.create({ data: assignment });
      }
      if (planned.proof) {
        await tx.deliveryProof.create({ data: planned.proof });
      }
      await tx.parcelStatusEvent.createMany({ data: [...planned.events] });
      if (isDelivered && planned.proof) {
        await tx.parcel.update({
          where: { id: parcelId },
          data: {
            status: ParcelStatus.DELIVERED,
            deliveredProofId: planned.proof.id,
          },
        });
      }

      const codeNumber = Number(planned.definition.code);
      const merchantStatus = mapParcelStatusToMerchantOrderStatus(
        planned.parcel.status,
      );
      await tx.merchantOrder.upsert({
        where: { trackingNumber },
        create: {
          merchantUserId: users.merchantId,
          reference: `GL-${1048 - (codeNumber - 1001)}`,
          trackingNumber,
          recipientName: planned.parcel.recipientName,
          destination: planned.parcel.recipientAddress,
          source: codeNumber % 2 === 1 ? 'API' : 'PORTAL',
          status: merchantStatus,
          failedDeliveryAttempts:
            merchantStatus === MerchantOrderStatus.DELIVERY_FAILED ? 1 : 0,
          deliveredAt:
            merchantStatus === MerchantOrderStatus.DELIVERED
              ? planned.parcel.createdAt
              : null,
          createdAt: planned.parcel.createdAt,
        },
        update: {
          recipientName: planned.parcel.recipientName,
          destination: planned.parcel.recipientAddress,
          source: codeNumber % 2 === 1 ? 'API' : 'PORTAL',
          status: merchantStatus,
          failedDeliveryAttempts:
            merchantStatus === MerchantOrderStatus.DELIVERY_FAILED ? 1 : 0,
          deliveredAt:
            merchantStatus === MerchantOrderStatus.DELIVERED
              ? planned.parcel.createdAt
              : null,
        },
      });

      if (existing) reset += 1;
      else created += 1;
    });
  }

  log(
    `[Seed] Demo deliveries for ${plan.colomboDate} (${COLOMBO_TIME_ZONE}): ${created} created, ${reset} reset, ${skipped} unchanged.`,
  );
  if (staleParcels.length > 0) {
    log(
      `[Seed] ${staleParcels.length} demo parcel(s) were assigned on an earlier day and will not appear in "today". ` +
        'Run `npx prisma db seed -- --reset-demo-deliveries` in apps/api to move them to today.',
    );
  }

  return {
    created,
    reset,
    skipped,
    colomboDate: plan.colomboDate,
    staleParcels,
  };
}
