export type ApplicationType = 'Merchant' | 'Courier'
export type ApplicationStatus = 'Pending review' | 'Approved' | 'Rejected'

export interface ApplicationItem {
  readonly id: string
  readonly applicantName: string
  readonly businessName?: string
  readonly ownerName?: string
  readonly email: string
  readonly phone: string
  readonly initials: string
  readonly type: ApplicationType
  readonly submittedDate: string
  readonly submittedTimeAgo: string
  readonly status: ApplicationStatus
  readonly documents: readonly {
    readonly title: string
    readonly fileType: string
    readonly verified: boolean
  }[]
  readonly notes?: string
}

export interface ActiveUserSummary {
  readonly totalCustomers: number
  readonly totalMerchants: number
  readonly totalCouriers: number
  readonly totalActive: number
}

