/**
 * Frontend contracts for the Courier API (`apps/api/src/modules/courier`).
 * Keep these in sync with `courier.service.ts` and the courier DTOs.
 * Dates arrive as ISO-8601 strings.
 */

export type ParcelStatus =
  | 'CREATED'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED'

export type DeliveryFailureReason =
  | 'RECIPIENT_UNAVAILABLE'
  | 'INCORRECT_ADDRESS'
  | 'RECIPIENT_REJECTED'
  | 'UNABLE_TO_CONTACT'
  | 'OTHER'

/** GET /courier/dashboard */
export interface CourierDashboard {
  readonly timeZone: string
  /** Calendar day (YYYY-MM-DD) in `timeZone`. */
  readonly date: string
  readonly totalAssigned: number
  readonly pending: number
  readonly pickedUp: number
  readonly inTransit: number
  readonly outForDelivery: number
  readonly delivered: number
  readonly failed: number
}

/** Query for GET /courier/deliveries/today (ListDeliveriesQueryDto). */
export interface ListDeliveriesQuery {
  readonly page?: number
  /** 1–100, defaults to 20 on the server. */
  readonly limit?: number
  readonly status?: ParcelStatus
  /** Matches tracking number or recipient name. Max 100 chars. */
  readonly search?: string
}

export interface DeliveryListItem {
  /** Parcel ID, used in the delivery detail routes. */
  readonly id: string
  readonly trackingNumber: string
  readonly recipientName: string
  readonly recipientPhone: string
  readonly recipientAddress: string
  readonly status: ParcelStatus
  readonly assignmentId: string
  readonly assignedAt: string
}

export interface PaginationMeta {
  readonly page: number
  readonly limit: number
  readonly total: number
  readonly totalPages: number
}

export interface PaginatedResponse<T> {
  readonly data: readonly T[]
  readonly pagination: PaginationMeta
}

export interface ProofMetadata {
  readonly id: string
  readonly originalFilename: string
  readonly contentType: string
  readonly sizeBytes: number
  readonly uploadedAt: string
}

export interface DeliveryProofSummary extends ProofMetadata {
  readonly uploadedByCurrentCourier: boolean
}

export interface StatusEventActor {
  readonly id: string
  readonly fullName: string
}

export interface DeliveryStatusEvent {
  readonly id: string
  readonly status: ParcelStatus
  readonly note: string | null
  readonly failureReason: DeliveryFailureReason | null
  readonly createdAt: string
  readonly actor: StatusEventActor | null
  readonly proof: ProofMetadata | null
}

/** GET /courier/deliveries/:parcelId */
export interface DeliveryDetails {
  readonly id: string
  readonly trackingNumber: string
  readonly recipient: {
    readonly name: string
    readonly phone: string
    readonly address: string
    readonly instructions: string | null
  }
  readonly parcel: {
    readonly contentsDescription: string | null
    readonly weightGrams: number | null
  }
  readonly status: ParcelStatus
  readonly assignment: {
    readonly id: string
    readonly assignedAt: string
  }
  /** Chronological (oldest first). */
  readonly events: readonly DeliveryStatusEvent[]
  /** Newest first. */
  readonly proofs: readonly DeliveryProofSummary[]
}

/** PATCH /courier/deliveries/:parcelId/status (UpdateDeliveryStatusDto). */
export interface UpdateDeliveryStatusRequest {
  readonly status: ParcelStatus
  readonly note?: string
  /** Required only when status is FAILED. */
  readonly failureReason?: DeliveryFailureReason
  /** Required only when status is DELIVERED. */
  readonly proofId?: string
}

/** POST /courier/deliveries/:parcelId/failure (ReportDeliveryFailureDto). */
export interface ReportDeliveryFailureRequest {
  readonly failureReason: DeliveryFailureReason
  readonly note?: string
}

/** Raw status event row returned by status/failure mutations. */
export interface StatusUpdateEvent {
  readonly id: string
  readonly parcelId: string
  readonly assignmentId: string | null
  readonly actorId: string | null
  readonly proofId: string | null
  readonly status: ParcelStatus
  readonly note: string | null
  readonly failureReason: DeliveryFailureReason | null
  readonly createdAt: string
}

export interface StatusUpdateResult {
  readonly parcelId: string
  readonly status: ParcelStatus
  readonly event: StatusUpdateEvent
  /** True when an identical failure report was already recorded. */
  readonly duplicate: boolean
}
