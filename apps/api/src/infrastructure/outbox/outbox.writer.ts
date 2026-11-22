import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  ParcelEventType,
  type ParcelCreatedV1,
  type ParcelStatusChangedV1,
} from '@swiftdrop/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  DeliveryFailureReason,
  ParcelStatus,
} from '../../generated/prisma/enums.js';

/** The parcel fields the writer needs; a full Prisma `Parcel` row fits. */
export interface OutboxParcelRef {
  readonly id: string;
  readonly trackingNumber: string;
  readonly merchantOrderId?: string | null;
}

export interface ParcelStatusChangedInput {
  readonly parcel: OutboxParcelRef;
  readonly previousStatus: ParcelStatus;
  readonly newStatus: ParcelStatus;
  /** Only for FAILED; ignored otherwise. */
  readonly failureReason?: DeliveryFailureReason | null;
  /** Courier assigned to the parcel, if any. */
  readonly courierId?: string | null;
}

export interface ParcelCreatedInput {
  readonly parcel: OutboxParcelRef;
  readonly status: ParcelStatus;
  readonly courierId?: string | null;
}

/** Stored without `sequence`; the relay adds it from the outbox row. */
type StoredEvent<T> = Omit<T, 'sequence'>;

const AGGREGATE_PARCEL = 'parcel';

/**
 * Records domain events in the transactional outbox (ARCHITECTURE.md §7.1).
 *
 * Call it with the **same transaction client** that changes the parcel, so the
 * event exists if and only if the change commits:
 *
 * ```ts
 * await this.prisma.$transaction(async (tx) => {
 *   await tx.parcel.updateMany({ ... });
 *   await this.outbox.recordParcelStatusChanged(tx, { parcel, previousStatus, newStatus });
 * });
 * ```
 *
 * The OutboxRelay publishes the rows to RabbitMQ afterwards.
 */
@Injectable()
export class OutboxWriter {
  /** @returns the new event's ID */
  async recordParcelStatusChanged(
    tx: Prisma.TransactionClient,
    input: ParcelStatusChangedInput,
  ): Promise<string> {
    const event: StoredEvent<ParcelStatusChangedV1> = {
      ...(await this.base(tx, input.parcel, input.courierId)),
      eventType: ParcelEventType.STATUS_CHANGED,
      previousStatus: input.previousStatus,
      newStatus: input.newStatus,
      failureReason:
        input.newStatus === 'FAILED' ? (input.failureReason ?? null) : null,
    };
    await this.insert(tx, event);
    return event.eventId;
  }

  /** @returns the new event's ID */
  async recordParcelCreated(
    tx: Prisma.TransactionClient,
    input: ParcelCreatedInput,
  ): Promise<string> {
    const event: StoredEvent<ParcelCreatedV1> = {
      ...(await this.base(tx, input.parcel, input.courierId)),
      eventType: ParcelEventType.CREATED,
      status: input.status,
    };
    await this.insert(tx, event);
    return event.eventId;
  }

  private async base(
    tx: Prisma.TransactionClient,
    parcel: OutboxParcelRef,
    courierId: string | null | undefined,
  ) {
    return {
      eventId: randomUUID(),
      version: 1 as const,
      occurredAt: new Date().toISOString(),
      parcelId: parcel.id,
      trackingNumber: parcel.trackingNumber,
      merchantId: await this.merchantIdFor(tx, parcel),
      courierId: courierId ?? null,
    };
  }

  /** Merchant user behind the parcel's merchant order (ADR 0003), read in the same transaction. */
  private async merchantIdFor(
    tx: Prisma.TransactionClient,
    parcel: OutboxParcelRef,
  ): Promise<string | null> {
    if (!parcel.merchantOrderId) {
      return null;
    }
    const order = await tx.merchantOrder.findUnique({
      where: { id: parcel.merchantOrderId },
      select: { merchantUserId: true },
    });
    return order?.merchantUserId ?? null;
  }

  private async insert(
    tx: Prisma.TransactionClient,
    event: StoredEvent<ParcelCreatedV1> | StoredEvent<ParcelStatusChangedV1>,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        id: event.eventId,
        aggregateType: AGGREGATE_PARCEL,
        aggregateId: event.parcelId,
        eventType: event.eventType,
        routingKey: event.eventType,
        payload: event,
        createdAt: new Date(event.occurredAt),
      },
    });
  }
}
