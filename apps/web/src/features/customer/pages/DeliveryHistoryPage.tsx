import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Download, Package, Search, Truck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { env } from '../../../lib/env'
import {
  CustomerApiError, getCustomerDeliveries, getCustomerSummary,
  STATUS_DETAILS, trackingDetailsLink, useCustomerRequest,
  type DeliveryFilter, type HistoryDelivery,
} from '../tracking/customerTrackingApi'
import { getCustomerReceipt, saveCustomerReceipt } from '../tracking/customerReceiptApi'
import './DeliveryHistoryPage.css'

type CustomerSession =
  | { state: 'checking' | 'redirecting' | 'denied' }
  | { state: 'error'; message: string }
  | { state: 'customer'; customerId: string }

const PAGE_SIZE = 5
const FILTERS: readonly { value: DeliveryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'history', label: 'History' },
]

function DeliveryRow({ delivery, onAccessError }: { delivery: HistoryDelivery; onAccessError: (error: unknown) => boolean }) {
  const [downloading, setDownloading] = useState(false)
  const [receiptError, setReceiptError] = useState('')
  const [receiptDownloaded, setReceiptDownloaded] = useState(false)
  const receiptRequest = useRef<AbortController | null>(null)
  useEffect(() => () => receiptRequest.current?.abort(), [])

  const downloadReceipt = async () => {
    if (receiptRequest.current) return
    const controller = new AbortController()
    receiptRequest.current = controller
    setDownloading(true)
    setReceiptError('')
    setReceiptDownloaded(false)
    try {
      const receipt = await getCustomerReceipt(delivery.id, controller.signal)
      if (controller.signal.aborted) return
      saveCustomerReceipt(receipt, controller.signal)
      setReceiptDownloaded(true)
    } catch (error) {
      if (controller.signal.aborted || onAccessError(error)) return
      setReceiptError(error instanceof CustomerApiError ? error.message : 'Unable to save the receipt. Please try again.')
    } finally {
      if (!controller.signal.aborted) {
        setDownloading(false)
        receiptRequest.current = null
      }
    }
  }

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
        <Link className="customer-deliveries-details-button" to={trackingDetailsLink(delivery.trackingNumber)} aria-label={`View details for ${delivery.trackingNumber}`}>
          View details <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <button className="customer-deliveries-receipt-button" type="button" disabled={downloading}
          aria-label={`${receiptError ? 'Retry receipt download' : 'Download receipt'} for ${delivery.trackingNumber}`}
          onClick={() => void downloadReceipt()}>
          <Download size={14} aria-hidden="true" />{downloading ? 'Downloading…' : receiptError ? 'Retry receipt' : 'Download receipt'}
        </button>
        {receiptError && <p className="customer-deliveries-receipt-error" role="alert">{receiptError}</p>}
        <span className="customer-deliveries-sr-only" role="status" aria-atomic="true">{receiptDownloaded ? 'Receipt download started.' : downloading ? 'Downloading receipt…' : ''}</span>
      </td>
    </tr>
  )
}

function DeliveryHistoryContent({ onAccessError }: { onAccessError: (error: unknown) => boolean }) {
  const [filter, setFilter] = useState<DeliveryFilter>('all')
  const [search, setSearch] = useState('')
  const [requestedPage, setRequestedPage] = useState(1)
  const normalizedSearch = search.trim().toUpperCase()
  const loadDeliveries = useCallback(async (signal: AbortSignal) => {
    const value = await getCustomerDeliveries({ filter, search: normalizedSearch, page: requestedPage, pageSize: PAGE_SIZE }, signal)
    if (!signal.aborted) {
      const lastPage = Math.max(1, Math.ceil(value.total / value.pageSize))
      if (value.page > lastPage) setRequestedPage(lastPage)
    }
    return value
  }, [filter, normalizedSearch, requestedPage])
  const { data: result, loading, error, retry } = useCustomerRequest(loadDeliveries, onAccessError)
  const { data: summary, error: summaryError, retry: retrySummary } = useCustomerRequest(getCustomerSummary, onAccessError)

  const pageCount = result ? Math.ceil(result.total / result.pageSize) : 0
  const page = result?.page ?? requestedPage
  const start = result?.items.length ? (result.page - 1) * result.pageSize + 1 : 0
  const end = result?.items.length ? start + result.items.length - 1 : 0
  const firstPageNumber = Math.max(1, Math.min(page - 2, pageCount - 4))
  const pageNumbers = Array.from({ length: Math.min(5, pageCount) }, (_, index) => firstPageNumber + index)
  const filtered = filter !== 'all' || Boolean(normalizedSearch)

  return (
    <div className="customer-deliveries-page">
      <header className="customer-deliveries-heading">
        <h1 className="customer-deliveries-title">My deliveries</h1>
        <p className="customer-deliveries-subtitle">View and manage your parcel deliveries.</p>
      </header>

      <section className="customer-deliveries-metrics" aria-label="Delivery summary" aria-busy={!summary && !summaryError}>
        {[
          { label: 'Active deliveries', value: summary?.activeDeliveries, Icon: Package, attention: false },
          { label: 'Delivered this month', value: summary?.deliveredThisMonth, Icon: Truck, attention: false },
          { label: 'Needs attention', value: summary?.needsAttention, Icon: AlertTriangle, attention: true },
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
      <div className="customer-deliveries-summary-note" role={summaryError ? 'alert' : 'status'}>
        {summaryError ? <>{summaryError} <button className="customer-deliveries-clear-button" type="button" onClick={retrySummary}>Retry statistics</button></>
          : summary ? `Statistics cover your deliveries. Reporting month: ${summary.reportingMonth} (UTC).` : 'Loading delivery statistics…'}
      </div>

      <section className="customer-deliveries-card" aria-label="Your deliveries" aria-busy={loading}>
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
              maxLength={64}
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
                {['Tracking Number', 'Destination', 'Created', 'Status', 'Actions'].map((label) => (
                  <th className="customer-deliveries-column" scope="col" key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result?.items.map((delivery) => <DeliveryRow key={delivery.id} delivery={delivery} onAccessError={onAccessError} />)}
              {!result?.items.length && (
                <tr>
                  <td className="customer-deliveries-empty-cell" colSpan={5}>
                    <div className="customer-deliveries-empty">
                      <Package size={32} className="customer-deliveries-empty-icon" aria-hidden="true" />
                      <h2 className="customer-deliveries-empty-title" role={error ? 'alert' : 'status'}>
                        {loading ? 'Loading deliveries…' : error ? 'Unable to load deliveries.' : filtered ? 'No matching deliveries found.' : 'No deliveries found.'}
                      </h2>
                      <p className="customer-deliveries-empty-description">
                        {loading ? 'Fetching your delivery history.' : error || (filtered ? 'Try another tracking number or select a different filter.' : 'Your deliveries will appear here once you create a delivery request.')}
                      </p>
                      {error && <button className="customer-deliveries-retry-button" type="button" onClick={retry}>Try again</button>}
                      {!loading && !error && filtered && <button className="customer-deliveries-clear-button" type="button" onClick={() => { setFilter('all'); setSearch(''); setRequestedPage(1) }}>Clear filters</button>}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="customer-deliveries-footer">
          <p className="customer-deliveries-count" role="status" aria-atomic="true">
            {loading ? 'Loading delivery list…' : error ? 'Delivery list unavailable' : result?.total ? `Showing ${start}–${end} of ${result.total}` : 'Showing 0 of 0'}
          </p>
          <nav className="customer-deliveries-pagination" aria-label="Delivery pages">
            <button className="customer-deliveries-page-button" type="button" disabled={loading || !result || page <= 1} onClick={() => setRequestedPage(page - 1)}>Previous</button>
            {pageNumbers.map((page) => (
              <button className="customer-deliveries-page-button customer-deliveries-page-number" type="button" key={page} aria-label={`Page ${page}`} aria-current={result?.page === page ? 'page' : undefined} onClick={() => setRequestedPage(page)}>{page}</button>
            ))}
            {!pageCount && <span className="customer-deliveries-page-empty">No pages</span>}
            <button className="customer-deliveries-page-button" type="button" disabled={loading || !result || page >= pageCount} onClick={() => setRequestedPage(page + 1)}>Next</button>
          </nav>
        </div>
      </section>
      <p id="customer-deliveries-actions-note" className="customer-deliveries-actions-note">Receipts record the booked delivery charge and do not confirm payment.</p>
    </div>
  )
}

export function DeliveryHistoryPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<CustomerSession>({ state: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const onAccessError = useCallback((error: unknown) => {
    if (!(error instanceof CustomerApiError) || ![401, 403].includes(error.status)) return false
    setSession({ state: error.status === 401 ? 'redirecting' : 'denied' })
    if (error.status === 401) navigate('/login', { replace: true })
    return true
  }, [navigate])

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
    return <DeliveryHistoryContent key={session.customerId} onAccessError={onAccessError} />
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
