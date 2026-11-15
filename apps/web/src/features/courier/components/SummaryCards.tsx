import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPinned,
  PackageCheck,
  Truck,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import type { CourierDashboard, ParcelStatus } from '../types/courier.types'
import type { StatusTone } from '../utils/deliveryStatus'
import './SummaryCards.css'

interface SummaryCardConfig {
  readonly key: keyof Omit<CourierDashboard, 'timeZone' | 'date'>
  readonly label: string
  readonly icon: LucideIcon
  readonly tone: StatusTone | 'primary'
  /** Status filter applied when the card is selected; undefined = all. */
  readonly status: ParcelStatus | undefined
}

const CARDS: readonly SummaryCardConfig[] = [
  { key: 'totalAssigned', label: 'Total assigned', icon: ClipboardList, tone: 'primary', status: undefined },
  { key: 'pending', label: 'Pending pickup', icon: Clock3, tone: 'pending', status: 'ASSIGNED' },
  { key: 'pickedUp', label: 'Picked up', icon: PackageCheck, tone: 'picked', status: 'PICKED_UP' },
  { key: 'inTransit', label: 'In transit', icon: Truck, tone: 'transit', status: 'IN_TRANSIT' },
  { key: 'outForDelivery', label: 'Out for delivery', icon: MapPinned, tone: 'out', status: 'OUT_FOR_DELIVERY' },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2, tone: 'success', status: 'DELIVERED' },
  { key: 'failed', label: 'Failed', icon: XCircle, tone: 'danger', status: 'FAILED' },
]

interface SummaryCardsProps {
  readonly dashboard: CourierDashboard | null
  readonly activeStatus: ParcelStatus | undefined
  readonly onSelectStatus: (status: ParcelStatus | undefined) => void
}

export function SummaryCards({ dashboard, activeStatus, onSelectStatus }: SummaryCardsProps) {
  const total = dashboard?.totalAssigned ?? 0
  const completed = (dashboard?.delivered ?? 0) + (dashboard?.failed ?? 0)
  const completion = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <section className="cp-summary" aria-label="Today's delivery summary">
      <ul className="cp-summary__grid">
        {CARDS.map(({ key, label, icon: Icon, tone, status }) => {
          const isActive = activeStatus === status
          return (
            <li key={key} className={key === 'totalAssigned' ? 'cp-summary__item--wide' : undefined}>
              <button
                type="button"
                className={`cp-summary-card cp-summary-card--${tone} ${isActive ? 'cp-summary-card--active' : ''}`}
                aria-pressed={isActive}
                onClick={() => onSelectStatus(isActive && status ? undefined : status)}
                title={status ? `Show ${label.toLowerCase()} deliveries` : 'Show all deliveries'}
              >
                <span className="cp-summary-card__icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="cp-summary-card__text">
                  <span className="cp-summary-card__label">{label}</span>
                  {dashboard ? (
                    <span className="cp-summary-card__value">{dashboard[key]}</span>
                  ) : (
                    <span className="cp-summary-card__skeleton" aria-label="Loading" />
                  )}
                </span>
                {key === 'totalAssigned' && dashboard && (
                  <span className="cp-summary-card__progress">
                    <span className="cp-summary-card__progress-label">
                      {completed} of {total} completed
                    </span>
                    <span
                      className="cp-summary-card__progress-track"
                      role="progressbar"
                      aria-label="Deliveries completed today"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={completion}
                    >
                      <span className="cp-summary-card__progress-fill" style={{ width: `${completion}%` }} />
                    </span>
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
