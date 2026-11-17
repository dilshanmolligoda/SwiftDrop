export type DeliveryOutcome = 'Delivered' | 'Failed'

export interface DeliveryReportRecord {
  readonly id: string
  readonly trackingNo: string
  readonly recipient: string
  readonly courier: string
  readonly zone: string
  readonly completedAt: string
  readonly outcome: DeliveryOutcome
  readonly evidenceOrReason: string
}

export interface ReportsMetrics {
  readonly completedAttempts: number
  readonly deliveredCount: number
  readonly failedAttempts: number
  readonly successRate: number
  readonly failureRate: number
}

