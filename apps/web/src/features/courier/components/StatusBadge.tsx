import type { ParcelStatus } from '../types/courier.types'
import { STATUS_LABELS, STATUS_TONES } from '../utils/deliveryStatus'
import './StatusBadge.css'

interface StatusBadgeProps {
  readonly status: ParcelStatus
  readonly size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  return (
    <span className={`cp-status cp-status--${STATUS_TONES[status]} cp-status--${size}`}>
      <span className="cp-status__dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  )
}
