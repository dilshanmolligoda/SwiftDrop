import { Link } from 'react-router-dom'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { useSession } from '../../../app/auth/session'
import { LiveIndicator } from '../../../lib/realtime/LiveIndicator'
import { useLiveParcelEvents } from '../../../lib/realtime/useParcelRealtime'
import { DeliveryListPanel } from '../components/DeliveryListPanel'
import { ErrorState } from '../components/StateViews'
import { SummaryCards } from '../components/SummaryCards'
import { useCourierDashboard, useTodayDeliveries } from '../hooks/useCourierData'
import { useDeliveryListParams } from '../hooks/useDeliveryListParams'
import { STATUS_LABELS } from '../utils/deliveryStatus'
import { formatCalendarDay, getFirstName, getGreeting } from '../utils/format'
import './CourierPages.css'

const DASHBOARD_PAGE_SIZE = 10

export function CourierDashboardPage() {
  const { user } = useSession()
  const dashboard = useCourierDashboard()
  const params = useDeliveryListParams()
  const deliveries = useTodayDeliveries({
    page: params.page,
    limit: DASHBOARD_PAGE_SIZE,
    status: params.status,
    search: params.search || undefined,
  })

  const isRefreshing = dashboard.isLoading || deliveries.isLoading
  const refreshAll = () => {
    dashboard.reload()
    deliveries.reload()
  }
  // Live: reload when one of this courier's parcels changes (e.g. from another device).
  const { state: liveState } = useLiveParcelEvents(refreshAll)

  return (
    <div className="cp-page">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-header__title">
            {getGreeting()}, {getFirstName(user.fullName)}
          </h1>
          <p className="cp-page-header__subtitle">
            {dashboard.data
              ? `Your delivery plan for ${formatCalendarDay(dashboard.data.date)}.`
              : 'Your delivery plan for today.'}
          </p>
        </div>
        <div className="cp-page-header__actions">
          <LiveIndicator state={liveState} />
          <button type="button" className="cp-btn cp-btn--ghost" onClick={refreshAll} disabled={isRefreshing}>
            <RefreshCw className={isRefreshing ? 'cp-spin' : undefined} aria-hidden="true" />
            Refresh
          </button>
          <Link to="/courier/deliveries" className="cp-btn">
            All deliveries
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </header>

      {dashboard.error && !dashboard.data ? (
        <div className="cp-card">
          <ErrorState error={dashboard.error} onRetry={dashboard.reload} />
        </div>
      ) : (
        <SummaryCards dashboard={dashboard.data} activeStatus={params.status} onSelectStatus={params.setStatus} />
      )}

      <DeliveryListPanel
        title="Today's deliveries"
        subtitle={
          params.status
            ? `Showing ${STATUS_LABELS[params.status].toLowerCase()} deliveries`
            : 'Ordered by assignment time'
        }
        deliveries={deliveries}
        params={params}
      />
    </div>
  )
}
