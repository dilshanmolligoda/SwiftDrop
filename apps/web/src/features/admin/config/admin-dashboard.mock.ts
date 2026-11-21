import type { CourierWorkload, DashboardMetrics, UnassignedParcel } from '../types/admin-dashboard.types'

export const DEFAULT_DASHBOARD_METRICS: DashboardMetrics = {
  unassignedParcelsCount: 18,
  activeDeliveriesCount: 64,
  deliveredTodayCount: 46,
  completedAttemptsRate: 92,
  pendingApplicationsCount: 4,
  successRate: 92,
  failedAttemptsCount: 4,
  deliveredCount: 46,
  totalCompletedAttempts: 50,
}

export const INITIAL_UNASSIGNED_PARCELS: UnassignedParcel[] = [
  {
    id: '1',
    trackingNo: 'SD-25018',
    pickup: 'Colombo 03',
    dropoff: 'Colombo 05',
    weight: '2.5 kg',
    size: 'Small',
    status: 'Failed attempt',
    waitingTime: '1 day 2 hr',
  },
  {
    id: '2',
    trackingNo: 'SD-25019',
    pickup: 'Colombo 07',
    dropoff: 'Nugegoda',
    weight: '4 kg',
    size: 'Medium',
    status: 'Failed attempt',
    waitingTime: '18 hr',
  },
  {
    id: '3',
    trackingNo: 'SD-25020',
    pickup: 'Dehiwala',
    dropoff: 'Mount Lavinia',
    weight: '1 kg',
    size: 'Small',
    status: 'New delivery',
    waitingTime: '24 min',
  },
  {
    id: '4',
    trackingNo: 'SD-25021',
    pickup: 'Colombo 02',
    dropoff: 'Rajagiriya',
    weight: '8 kg',
    size: 'Medium',
    status: 'New delivery',
    waitingTime: '18 min',
  },
]

export const INITIAL_COURIERS: CourierWorkload[] = [
  {
    id: 'c1',
    name: 'Kasun Perera',
    initials: 'KP',
    zone: 'Colombo South',
    activeCount: 6,
    capacity: 8,
  },
  {
    id: 'c2',
    name: 'Nuwan Silva',
    initials: 'NS',
    zone: 'Colombo Central',
    activeCount: 4,
    capacity: 8,
  },
  {
    id: 'c3',
    name: 'Dilani Fernando',
    initials: 'DF',
    zone: 'Nugegoda',
    activeCount: 3,
    capacity: 8,
  },
  {
    id: 'c4',
    name: 'Ruwan Jayasuriya',
    initials: 'RJ',
    zone: 'Rajagiriya',
    activeCount: 0,
    capacity: 8,
  },
]

