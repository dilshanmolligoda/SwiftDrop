export interface CourierActiveDelivery {
  readonly id: string
  readonly trackingNo: string
  readonly destination: string
  readonly status: 'Out for delivery' | 'In transit'
}

export interface CourierDetailItem {
  readonly id: string
  readonly courierCode: string
  readonly name: string
  readonly initials: string
  readonly phone: string
  readonly email: string
  readonly serviceZones: readonly string[]
  readonly vehicleType: string
  readonly vehicleOwnership: string
  readonly vehicleRegistration: string
  readonly maxParcelLoadKg: number
  readonly cargoSpaceDimensions: string
  readonly coveredStorage: boolean
  readonly isApproved: boolean
  readonly isAvailable: boolean
  readonly activeDeliveriesCount: number
  readonly verifiedDocumentsCount: number
  readonly activeDeliveriesList: readonly CourierActiveDelivery[]
}

