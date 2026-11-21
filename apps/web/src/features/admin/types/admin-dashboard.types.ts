export interface UnassignedParcel {
  id: string
  trackingNo: string
  pickup: string
  dropoff: string
  weight: string
  size: string
  status: 'Failed attempt' | 'New delivery'
  waitingTime: string
}

export interface CourierWorkload {
  id: string
  name: string
  initials: string
  zone: string
  activeCount: number
  capacity: number
}

export interface DashboardMetrics {
  unassignedParcelsCount: number
  activeDeliveriesCount: number
  deliveredTodayCount: number
  completedAttemptsRate: number
  pendingApplicationsCount: number
  successRate: number
  failedAttemptsCount: number
  deliveredCount: number
  totalCompletedAttempts: number
}

