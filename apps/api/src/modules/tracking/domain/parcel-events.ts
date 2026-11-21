import { InternalServerErrorException } from '@nestjs/common';
import type { ParcelHistoryEvent } from './parcel.types.js';

export interface RecordedParcelEvent {
  readonly id?: string;
  readonly status: string;
  readonly createdAt: Date;
}

function project(event: RecordedParcelEvent) {
  if (
    !(event.createdAt instanceof Date) ||
    !Number.isFinite(event.createdAt.getTime())
  ) {
    throw new InternalServerErrorException(
      'Unable to read customer parcel history',
    );
  }
  return {
    id: event.id,
    status: event.status,
    occurredAt: event.createdAt.toISOString(),
  };
}

/**
 * Only status+exact instant can identify a mirrored transition across stores.
 * Pair copies one-to-one, preserving repeated rows within each source and all
 * events at different instants. Never use status order or a fuzzy time window.
 */
export function mergeParcelEvents(
  bookingHistory: readonly RecordedParcelEvent[],
  courierEvents: readonly RecordedParcelEvent[],
): ParcelHistoryEvent[] {
  if (!Array.isArray(bookingHistory) || !Array.isArray(courierEvents)) {
    throw new InternalServerErrorException(
      'Unable to read customer parcel history',
    );
  }
  const booking = bookingHistory.map(project);
  const courier = courierEvents.map(project);
  const copies = new Map<string, number>();
  const key = (event: { status: string; occurredAt: string }) =>
    `${event.status}:${event.occurredAt}`;
  for (const event of booking)
    copies.set(key(event), (copies.get(key(event)) ?? 0) + 1);
  const uniqueCourier = courier.filter((event) => {
    const remaining = copies.get(key(event)) ?? 0;
    if (!remaining) return true;
    copies.set(key(event), remaining - 1);
    return false;
  });
  return [
    ...booking.map((event, index) => ({ ...event, source: 0, index })),
    ...uniqueCourier.map((event, index) => ({ ...event, source: 1, index })),
  ]
    .sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) ||
        a.source - b.source ||
        (a.id && b.id ? a.id.localeCompare(b.id) : a.index - b.index),
    )
    .map(({ status, occurredAt }) => ({ status, occurredAt }));
}
