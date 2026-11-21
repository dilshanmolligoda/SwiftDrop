import { useEffect } from 'react'
import { ListChecks, RefreshCw } from 'lucide-react'
import type { ApiResource } from '../hooks/useApiResource'
import type { DeliveryListParams } from '../hooks/useDeliveryListParams'
import type { DeliveryListItem, PaginatedResponse } from '../types/courier.types'
import { STATUS_LABELS } from '../utils/deliveryStatus'
import { DeliveryFilters } from './DeliveryFilters'
import { DeliveryTable } from './DeliveryTable'
import { Pagination } from './Pagination'
import { EmptyState, ErrorAlert, ErrorState, LoadingState } from './StateViews'
import './DeliveryList.css'

interface DeliveryListPanelProps {
  readonly title: string
  readonly subtitle?: string
  readonly deliveries: ApiResource<PaginatedResponse<DeliveryListItem>>
  readonly params: DeliveryListParams
}

/** Searchable, filterable and paginated list of today's deliveries. */
export function DeliveryListPanel({ title, subtitle, deliveries, params }: DeliveryListPanelProps) {
  const { data, error, isLoading, reload } = deliveries
  const { page, status, search, setPage, setStatus, setSearch, clearFilters } = params
  const hasFilters = Boolean(status || search)
  const totalPages = data?.pagination.totalPages ?? 0

  // If filtering shrank the result set, jump back to the last page that exists.
  useEffect(() => {
    if (!isLoading && totalPages > 0 && page > totalPages) setPage(totalPages)
  }, [isLoading, page, totalPages, setPage])

  const renderBody = () => {
    if (!data) {
      return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading deliveries…" />
    }
    if (data.data.length === 0) {
      return hasFilters ? (
        <EmptyState
          title="No matching deliveries"
          description={
            status
              ? `No ${STATUS_LABELS[status].toLowerCase()} deliveries match your search today.`
              : 'Try a different tracking number or recipient name.'
          }
          action={
            <button type="button" className="cp-btn cp-btn--soft" onClick={clearFilters}>
              Clear filters
            </button>
          }
        />
      ) : (
        <EmptyState
          title="No deliveries assigned today"
          description="New assignments from dispatch will appear here automatically when you refresh."
        />
      )
    }
    return <DeliveryTable items={data.data} caption={title} />
  }

  return (
    <section className="cp-card cp-list-panel" aria-labelledby="cp-list-title" aria-busy={isLoading}>
      <header className="cp-card__header">
        <div>
          <h2 id="cp-list-title" className="cp-card__title">
            <ListChecks aria-hidden="true" />
            {title}
          </h2>
          {subtitle && <p className="cp-card__subtitle">{subtitle}</p>}
        </div>
        <button
          type="button"
          className="cp-btn cp-btn--ghost cp-btn--sm"
          onClick={reload}
          disabled={isLoading}
          aria-label="Refresh delivery list"
        >
          <RefreshCw className={isLoading ? 'cp-spin' : undefined} aria-hidden="true" />
          <span className="cp-list-panel__refresh-text">Refresh</span>
        </button>
      </header>

      <div className="cp-list-panel__toolbar">
        <DeliveryFilters search={search} status={status} onSearchChange={setSearch} onStatusChange={setStatus} />
      </div>

      {data && error && (
        <div className="cp-list-panel__inline-error">
          <ErrorAlert error={error} />
        </div>
      )}

      <div className={`cp-list-panel__body ${data && isLoading ? 'cp-list-panel__body--stale' : ''}`}>
        {renderBody()}
      </div>

      {data && (
        <footer className="cp-list-panel__footer">
          <Pagination pagination={data.pagination} onPageChange={setPage} disabled={isLoading} />
        </footer>
      )}
    </section>
  )
}
