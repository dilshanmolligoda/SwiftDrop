export type DeliveryStatus =
  | 'Failed attempt'
  | 'New delivery'
  | 'Out for delivery'
  | 'In transit'
  | 'Delivered'

export interface DeliveryItem {
  readonly id: string
  readonly trackingNo: string
  readonly recipient: string
  readonly pickup: string
  readonly dropoff: string
  readonly pickupAddress: string
  readonly dropoffAddress: string
  readonly weightKg: number
  readonly size: 'Small' | 'Medium' | 'Large'
  readonly dimensions: string
  readonly status: DeliveryStatus
  readonly courierName: string | null
  readonly courierId: string | null
  readonly waitingTime: string
  readonly zone: string
  readonly createdAt: string
}

export interface AvailableCourierCandidate {
  readonly id: string
  readonly name: string
  readonly initials: string
  readonly avatarColor?: string
  readonly vehicleType: string
  readonly zones: string
  readonly activeCount: number
  readonly maxCapacity: number
  readonly fitsLimits: boolean
  readonly isAvailable: boolean
}

