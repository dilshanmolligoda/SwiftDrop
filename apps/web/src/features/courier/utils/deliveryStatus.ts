import type { DeliveryFailureReason, ParcelStatus } from '../types/courier.types'

export type StatusTone = 'neutral' | 'pending' | 'picked' | 'transit' | 'out' | 'success' | 'danger'

export const STATUS_LABELS: Readonly<Record<ParcelStatus, string>> = {
  CREATED: 'Created',
  ASSIGNED: 'Pending pickup',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
}

export const STATUS_TONES: Readonly<Record<ParcelStatus, StatusTone>> = {
  CREATED: 'neutral',
  ASSIGNED: 'pending',
  PICKED_UP: 'picked',
  IN_TRANSIT: 'transit',
  OUT_FOR_DELIVERY: 'out',
  DELIVERED: 'success',
  FAILED: 'danger',
}

/** Mirrors STATUS_TRANSITIONS in the API's courier.service.ts. */
export const NEXT_STATUSES: Readonly<Partial<Record<ParcelStatus, readonly ParcelStatus[]>>> = {
  ASSIGNED: ['PICKED_UP'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
}

export function getNextStatuses(status: ParcelStatus): readonly ParcelStatus[] {
  return NEXT_STATUSES[status] ?? []
}

export const STATUS_ACTIONS: Readonly<Partial<Record<ParcelStatus, { label: string; description: string }>>> = {
  PICKED_UP: {
    label: 'Mark as picked up',
    description: 'Confirm you have collected the parcel from the sender or hub.',
  },
  IN_TRANSIT: {
    label: 'Start transit',
    description: 'The parcel is on its way to the delivery area.',
  },
  OUT_FOR_DELIVERY: {
    label: 'Mark out for delivery',
    description: 'You are heading to the recipient now.',
  },
  DELIVERED: {
    label: 'Complete delivery',
    description: 'Upload a proof photo, then confirm the hand-over.',
  },
  FAILED: {
    label: 'Report failed delivery',
    description: 'Record why the parcel could not be delivered.',
  },
}

/** Ordered statuses courier can filter by (CREATED parcels are never assigned). */
export const FILTERABLE_STATUSES: readonly ParcelStatus[] = [
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
]

/** Happy-path steps used by the progress tracker. */
export const DELIVERY_STEPS: readonly ParcelStatus[] = [
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]

export function isParcelStatus(value: string | null | undefined): value is ParcelStatus {
  return !!value && value in STATUS_LABELS
}

export const FAILURE_REASON_LABELS: Readonly<Record<DeliveryFailureReason, string>> = {
  RECIPIENT_UNAVAILABLE: 'Recipient unavailable',
  INCORRECT_ADDRESS: 'Incorrect address',
  RECIPIENT_REJECTED: 'Recipient rejected parcel',
  UNABLE_TO_CONTACT: 'Unable to contact recipient',
  OTHER: 'Other',
}

export const FAILURE_REASONS = Object.keys(FAILURE_REASON_LABELS) as DeliveryFailureReason[]

/** Matches the API's MaxLength(2000) on notes. */
export const NOTE_MAX_LENGTH = 2000
