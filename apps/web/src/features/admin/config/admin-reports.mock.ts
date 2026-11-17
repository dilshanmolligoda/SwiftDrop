import type {
  DeliveryReportRecord,
  ReportsMetrics,
} from '../types/admin-reports.types'

export const DEFAULT_REPORTS_METRICS: ReportsMetrics = {
  completedAttempts: 50,
  deliveredCount: 46,
  failedAttempts: 4,
  successRate: 92,
  failureRate: 8,
}

export const MOCK_REPORT_RECORDS: readonly DeliveryReportRecord[] = [
  {
    id: 'rep-1',
    trackingNo: 'SD-24896',
    recipient: 'Ruvani Silva',
    courier: 'Nuwan Silva',
    zone: 'Colombo Central',
    completedAt: '27 Oct 2026 14:22',
    outcome: 'Delivered',
    evidenceOrReason: 'View proof ↗',
  },
  {
    id: 'rep-2',
    trackingNo: 'SD-24895',
    recipient: 'Anjali Silva',
    courier: 'Kasun Perera',
    zone: 'Colombo South',
    completedAt: '27 Oct 2026 14:10',
    outcome: 'Failed',
    evidenceOrReason: 'Recipient unavailable',
  },
  {
    id: 'rep-3',
    trackingNo: 'SD-24894',
    recipient: 'Nimal Perera',
    courier: 'Kasun Perera',
    zone: 'Colombo South',
    completedAt: '27 Oct 2026 14:05',
    outcome: 'Delivered',
    evidenceOrReason: 'View proof ↗',
  },
  {
    id: 'rep-4',
    trackingNo: 'SD-24893',
    recipient: 'Sachini Dias',
    courier: 'Dilani Fernando',
    zone: 'Nugegoda',
    completedAt: '27 Oct 2026 13:52',
    outcome: 'Delivered',
    evidenceOrReason: 'View proof ↗',
  },
  {
    id: 'rep-5',
    trackingNo: 'SD-24892',
    recipient: 'Tharushi Silva',
    courier: 'Sahan Perera',
    zone: 'Colombo Central',
    completedAt: '27 Oct 2026 13:42',
    outcome: 'Failed',
    evidenceOrReason: 'Address not found',
  },
  {
    id: 'rep-6',
    trackingNo: 'SD-24891',
    recipient: 'Dinesh Fernando',
    courier: 'Ruwan Jayasuriya',
    zone: 'Dehiwala',
    completedAt: '27 Oct 2026 12:20',
    outcome: 'Delivered',
    evidenceOrReason: 'View proof ↗',
  },
] as const

