import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, Package, Search, Truck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { env } from '../../../lib/env'
import './DeliveryHistoryPage.css'

type DeliveryFilter = 'all' | 'active' | 'history'
type HistoryStatus = 'CREATED' | 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'
type CustomerSession =
  | { state: 'checking' | 'redirecting' | 'denied' }
  | { state: 'error'; message: string }
  | { state: 'customer'; customerId: string }

// UI model for a future authenticated delivery response, not an assumed API DTO.
interface HistoryDelivery {
  readonly id: string
  readonly customerId: string
  readonly trackingNumber: string
  readonly destination?: string
  readonly createdAt?: string
  readonly status: HistoryStatus
  readonly deliveredAt?: string
}

const PAGE_SIZE = 5
const FILTERS: readonly { value: DeliveryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'history', label: 'History' },
]
const STATUS_DETAILS: Record<HistoryStatus, { label: string; tone: string }> = {
  CREATED: { label: 'Created', tone: 'neutral' },
  PICKED_UP: { label: 'Picked Up', tone: 'transit' },
  IN_TRANSIT: { label: 'In Transit', tone: 'transit' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', tone: 'transit' },
  DELIVERED: { label: 'Delivered', tone: 'delivered' },
  FAILED: { label: 'Failed', tone: 'failed' },
}

function isActive(delivery: HistoryDelivery): boolean {
  return ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(delivery.status)
}

function getMonthKey(value: Date): string | null {
  if (!Number.isFinite(value.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: '2-digit', timeZone: 'Asia/Colombo',
  }).formatToParts(value)
  return `${parts.find(({ type }) => type === 'year')?.value}-${parts.find(({ type }) => type === 'month')?.value}`
}

function getDeliveryMetrics(deliveries: readonly HistoryDelivery[], now = new Date()) {
  const delivered = deliveries.filter(({ status }) => status === 'DELIVERED')
  const month = getMonthKey(now)
  const hasUnknownDeliveryDate = delivered.some(({ deliveredAt }) => !deliveredAt || !Number.isFinite(Date.parse(deliveredAt)))
  return {
    active: deliveries.filter(isActive).length,
    // An absent delivery timestamp cannot establish a delivery's calendar month.
    delivered: hasUnknownDeliveryDate || !month ? null : delivered.filter(({ deliveredAt }) => getMonthKey(new Date(deliveredAt!)) === month).length,
    attention: deliveries.filter(({ status }) => status === 'FAILED').length,
  }
}

function getDeliveryPage(deliveries: readonly HistoryDelivery[], filter: DeliveryFilter, search: string, requestedPage: number) {
  const query = search.trim().toUpperCase()
  const matches = deliveries.filter((delivery) => {
    const matchesFilter = filter === 'all' || (filter === 'active' ? isActive(delivery) : ['DELIVERED', 'FAILED'].includes(delivery.status))
    return matchesFilter && delivery.trackingNumber.toUpperCase().includes(query)
  })
  const pageCount = Math.ceil(matches.length / PAGE_SIZE)
  const page = Math.max(1, Math.min(requestedPage, pageCount || 1))
  const offset = (page - 1) * PAGE_SIZE
  return {
    items: matches.slice(offset, offset + PAGE_SIZE),
    total: matches.length,
    page,
    pageCount,
    start: matches.length ? offset + 1 : 0,
    end: Math.min(offset + PAGE_SIZE, matches.length),
  }
}

function DeliveryRow({ delivery }: { delivery: HistoryDelivery }) {
  const status = STATUS_DETAILS[delivery.status]
  const date = delivery.createdAt && Number.isFinite(Date.parse(delivery.createdAt))
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' }).format(new Date(delivery.createdAt))
    : null

  return (
    <tr className="customer-deliveries-row">
      <th className="customer-deliveries-cell customer-deliveries-tracking" scope="row">{delivery.trackingNumber}</th>
      <td className="customer-deliveries-cell">{delivery.destination || 'Unavailable'}</td>
      <td className="customer-deliveries-cell">{date ? <time dateTime={delivery.createdAt}>{date}</time> : 'Unavailable'}</td>
      <td className="customer-deliveries-cell">
        <span className={`customer-deliveries-badge customer-deliveries-badge--${status.tone}`}>{status.label}</span>
      </td>
      <td className="customer-deliveries-cell customer-deliveries-action-cell">
        {/* Tracking currently has no per-parcel URL contract. Add details and
            receipt actions here only after their authorized APIs/routes exist. */}
        <button className="customer-deliveries-details-button" type="button" disabled aria-label={`View details for ${delivery.trackingNumber} (not available yet)`} aria-describedby="customer-deliveries-actions-note">
          View details <ArrowRight size={14} aria-hidden="true" />
        </button>
      </td>
    </tr>
  )
}

function DeliveryHistoryContent({ customerId, deliveries }: {
  customerId: string
  deliveries: readonly HistoryDelivery[] | null
}) {
  const [filter, setFilter] = useState<DeliveryFilter>('all')
  const [search, setSearch] = useState('')
  const [requestedPage, setRequestedPage] = useState(1)
  // Defense in depth for a future API adapter. Server-side ownership enforcement
  // is still required; browser-wide localStorage is deliberately not a source.
  const ownedDeliveries = deliveries?.filter((delivery) => delivery.customerId === customerId) ?? []
  const metrics = deliveries === null ? null : getDeliveryMetrics(ownedDeliveries)
  const result = getDeliveryPage(ownedDeliveries, filter, search, requestedPage)
  const firstPageNumber = Math.max(1, Math.min(result.page - 2, result.pageCount - 4))
  const pageNumbers = Array.from({ length: Math.min(5, result.pageCount) }, (_, index) => firstPageNumber + index)
  const filtered = filter !== 'all' || Boolean(search.trim())

  return (
    <div className="customer-deliveries-page">
      <header className="customer-deliveries-heading">
        <h1 className="customer-deliveries-title">My deliveries</h1>
        <p className="customer-deliveries-subtitle">View and manage your parcel deliveries.</p>
      </header>

      <section className="customer-deliveries-metrics" aria-label="Delivery summary">
        {[
          { label: 'Active deliveries', value: metrics?.active, Icon: Package, attention: false },
          { label: 'Delivered this month', value: metrics?.delivered, Icon: Truck, attention: false },
          { label: 'Needs attention', value: metrics?.attention, Icon: AlertTriangle, attention: true },
        ].map(({ label, value, Icon, attention }) => (
          <div className="customer-deliveries-metric" key={label}>
            <span className={`customer-deliveries-metric-icon${attention ? ' customer-deliveries-metric-icon--attention' : ''}`} aria-hidden="true"><Icon size={22} /></span>
            <div>
              <p className="customer-deliveries-metric-label">{label}</p>
              <span className="customer-deliveries-metric-value" aria-label={value == null ? 'Unavailable' : undefined}>{value ?? '—'}</span>
            </div>
          </div>
        ))}
      </section>
      <p className="customer-deliveries-summary-note">
        {deliveries === null ? 'Customer delivery data is not connected yet. Statistics are unavailable.' : 'Statistics cover your deliveries. Calendar dates use Sri Lanka time.'}
      </p>

      <section className="customer-deliveries-card" aria-label="Your deliveries">
        <div className="customer-deliveries-toolbar">
          <div className="customer-deliveries-filters" role="group" aria-label="Filter deliveries">
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                className={`customer-deliveries-filter${filter === value ? ' customer-deliveries-filter--active' : ''}`}
                type="button"
                aria-pressed={filter === value}
                aria-controls="customer-deliveries-table"
                onClick={() => { setFilter(value); setRequestedPage(1) }}
              >{label}</button>
            ))}
          </div>
          <div className="customer-deliveries-search">
            <label className="customer-deliveries-sr-only" htmlFor="customer-deliveries-search">Search tracking number</label>
            <Search className="customer-deliveries-search-icon" size={16} aria-hidden="true" />
            <input
              id="customer-deliveries-search"
              className="customer-deliveries-search-input"
              type="search"
              placeholder="Search tracking number"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setRequestedPage(1) }}
              aria-controls="customer-deliveries-table"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="customer-deliveries-table-scroll" role="region" aria-label="Delivery table; scroll horizontally on smaller screens" tabIndex={0}>
          <table id="customer-deliveries-table" className="customer-deliveries-table">
            <caption className="customer-deliveries-sr-only">Your {filter === 'all' ? '' : `${filter} `}deliveries, filtered by tracking number. Created dates use Sri Lanka time.</caption>
            <thead>
              <tr>
                {['Tracking Number', 'Destination', 'Created', 'Status', 'View Details'].map((label) => (
                  <th className="customer-deliveries-column" scope="col" key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.items.map((delivery) => <DeliveryRow key={delivery.id} delivery={delivery} />)}
              {!result.total && (
                <tr>
                  <td className="customer-deliveries-empty-cell" colSpan={5}>
                    <div className="customer-deliveries-empty">
                      <Package size={32} className="customer-deliveries-empty-icon" aria-hidden="true" />
                      <h2 className="customer-deliveries-empty-title">
                        {deliveries === null ? 'Delivery history is not connected yet.' : filtered ? 'No matching deliveries found.' : 'No deliveries found.'}
                      </h2>
                      <p className="customer-deliveries-empty-description">
                        {deliveries === null ? 'Your delivery list will appear here once customer delivery history is available.' : filtered ? 'Try another tracking number or select a different filter.' : 'Your deliveries will appear here once you create a delivery request.'}
                      </p>
                      {filtered && <button className="customer-deliveries-clear-button" type="button" onClick={() => { setFilter('all'); setSearch(''); setRequestedPage(1) }}>Clear filters</button>}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="customer-deliveries-footer">
          <p className="customer-deliveries-count" role="status" aria-atomic="true">
            {deliveries === null ? 'Delivery list unavailable' : result.total ? `Showing ${result.start}–${result.end} of ${result.total}` : 'Showing 0 of 0'}
          </p>
          <nav className="customer-deliveries-pagination" aria-label="Delivery pages">
            <button className="customer-deliveries-page-button" type="button" disabled={result.page <= 1} onClick={() => setRequestedPage(result.page - 1)}>Previous</button>
            {pageNumbers.map((page) => (
              <button className="customer-deliveries-page-button customer-deliveries-page-number" type="button" key={page} aria-label={`Page ${page}`} aria-current={result.page === page ? 'page' : undefined} onClick={() => setRequestedPage(page)}>{page}</button>
            ))}
            {!result.pageCount && <span className="customer-deliveries-page-empty">No pages</span>}
            <button className="customer-deliveries-page-button" type="button" disabled={result.page >= result.pageCount} onClick={() => setRequestedPage(result.page + 1)}>Next</button>
          </nav>
        </div>
      </section>
      <p id="customer-deliveries-actions-note" className="customer-deliveries-actions-note">Parcel details and receipt downloads are not connected yet.</p>
    </div>
  )
}

export function DeliveryHistoryPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<CustomerSession>({ state: 'checking' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const verifyCustomer = async () => {
      try {
        const response = await fetch(`${env.apiBaseUrl}/auth/me`, {
          method: 'GET', credentials: 'include', signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (response.status === 401) {
          setSession({ state: 'redirecting' })
          navigate('/login', { replace: true })
          return
        }
        if (response.status === 403) {
          setSession({ state: 'denied' })
          return
        }
        if (!response.ok) throw new Error('Session request failed')

        const user: unknown = await response.json()
        if (controller.signal.aborted) return
        if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string' || !user.id.trim() || !('role' in user) || !('approvalStatus' in user)) {
          throw new Error('Invalid session response')
        }
        if (user.approvalStatus === 'PENDING' || user.approvalStatus === 'REJECTED') {
          setSession({ state: 'redirecting' })
          navigate('/application-status', { replace: true })
          return
        }
        if (user.approvalStatus !== 'APPROVED') throw new Error('Unverified approval status')
        if (user.role !== 'CUSTOMER') {
          const destination = user.role === 'MERCHANT' ? '/merchant/dashboard'
            : user.role === 'COURIER' ? '/courier/dashboard'
              : user.role === 'ADMIN' || user.role === 'DISPATCHER' ? '/admin' : null
          setSession({ state: destination ? 'redirecting' : 'denied' })
          if (destination) navigate(destination, { replace: true })
          return
        }
        setSession({ state: 'customer', customerId: user.id })
      } catch {
        if (controller.signal.aborted) return
        setSession({ state: 'error', message: 'Unable to verify your customer session. Please check your connection and try again.' })
      }
    }
    void verifyCustomer()
    return () => controller.abort()
  }, [navigate, attempt])

  if (session.state === 'customer') {
    // No secure customer delivery endpoint is available. null means unavailable,
    // not a confirmed empty account. Never populate from shared localStorage.
    return <DeliveryHistoryContent key={session.customerId} customerId={session.customerId} deliveries={null} />
  }
  if (session.state === 'checking' || session.state === 'redirecting') {
    return <div className="customer-deliveries-session" role="status">Verifying customer access…</div>
  }
  return (
    <section className="customer-deliveries-session" aria-labelledby="customer-deliveries-access-title">
      <h1 id="customer-deliveries-access-title" className="customer-deliveries-title">{session.state === 'denied' ? 'Customer access required' : 'Unable to load deliveries'}</h1>
      <p role="alert">{session.state === 'error' ? session.message : 'This page is only available to approved customer accounts.'}</p>
      <div className="customer-deliveries-session-actions">
        {session.state === 'error' && <button className="customer-deliveries-retry-button" type="button" onClick={() => { setSession({ state: 'checking' }); setAttempt((value) => value + 1) }}>Try again</button>}
        <Link className="customer-deliveries-login-link" to="/login">Go to login</Link>
      </div>
    </section>
  )
}
