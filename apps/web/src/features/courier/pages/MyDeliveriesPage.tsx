import { DeliveryListPanel } from '../components/DeliveryListPanel'
import { useTodayDeliveries } from '../hooks/useCourierData'
import { useDeliveryListParams } from '../hooks/useDeliveryListParams'
import './CourierPages.css'

const PAGE_SIZE = 20

export function MyDeliveriesPage() {
  const params = useDeliveryListParams()
  const deliveries = useTodayDeliveries({
    page: params.page,
    limit: PAGE_SIZE,
    status: params.status,
    search: params.search || undefined,
  })
  const total = deliveries.data?.pagination.total

  return (
    <div className="cp-page">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-header__title">My deliveries</h1>
          <p className="cp-page-header__subtitle">
            Parcels assigned to you today
            {total !== undefined && ` · ${total} ${total === 1 ? 'result' : 'results'}`}
          </p>
        </div>
      </header>

      <DeliveryListPanel
        title="Assigned deliveries"
        subtitle="Select a delivery to view details and update its status."
        deliveries={deliveries}
        params={params}
      />
    </div>
  )
}
