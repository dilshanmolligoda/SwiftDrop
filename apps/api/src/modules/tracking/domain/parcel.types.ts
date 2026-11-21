/** Read model, not a Prisma model or a canonical parcel status enum. */
export interface ParcelHistoryEvent {
  readonly status: string;
  readonly occurredAt: string;
  readonly internalNote?: string;
}

export interface ParcelReadRecord {
  readonly id: string;
  readonly customerId: string | null;
  readonly trackingNumber: string;
  /** Opaque status code supplied by the future parcels module. */
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly deliveredAt?: string;
  readonly origin?: string;
  readonly destination?: string;
  readonly history: readonly ParcelHistoryEvent[];
}

export interface PublicTrackingResponse {
  readonly trackingNumber: string;
  readonly status: string;
  readonly updatedAt?: string;
  readonly history: readonly { status: string; occurredAt: string }[];
}

export interface CustomerTrackingResponse extends PublicTrackingResponse {
  readonly id: string;
  readonly createdAt: string;
  readonly deliveredAt?: string;
  readonly origin?: string;
  readonly destination?: string;
}

export interface DeliveryHistoryItem {
  readonly id: string;
  readonly trackingNumber: string;
  readonly destination?: string;
  readonly status: string;
  readonly createdAt: string;
  readonly deliveredAt?: string;
}

export interface DeliveryHistoryPage {
  readonly items: readonly DeliveryHistoryItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface DeliverySummary {
  readonly activeDeliveries: number;
  /** Confirmed delivered status with a delivery timestamp in the UTC month. */
  readonly deliveredThisMonth: number;
  readonly needsAttention: number;
  readonly reportingMonth: string;
  readonly timeZone: 'UTC';
}
