export interface ZonePricingItem {
  readonly id: string
  readonly name: string
  readonly coveredAreas: string
  readonly baseFeeLkr: number
  readonly extraPerKgLkr: number
  readonly isActive: boolean
}

