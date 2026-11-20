import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronDown, Download, Package, Search, TriangleAlert } from 'lucide-react'
import { apiRequest } from '../../../api/client'
import { env as appEnv } from '../../../lib/env'
import styles from './MerchantOrdersPage.module.css'

type OrderStatus =
  | 'AWAITING_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'IN_TRANSIT'
  | 'PICKED_UP'
  | 'DELIVERY_FAILED'
  | 'DELIVERED'

interface MerchantOrder {
  readonly id: string
  readonly trackingNumber: string
  readonly reference: string
  readonly recipient: string
  readonly destination: string
  readonly packageSize: 'SMALL' | 'MEDIUM' | 'LARGE' | null
  readonly weightKg: number | null
  readonly feeLkr: number | null
  readonly status: OrderStatus
  readonly source: 'API' | 'PORTAL'
  readonly createdAt: string
}

interface MerchantDashboardResponse {
  reportingPeriod: { month: number; year: number }
  metrics: {
    activeDeliveries: number
    deliveredThisMonth: number
    needsAttention: number
  }
}

interface MerchantOrdersPageResponse {
  data: MerchantOrder[]
  page: number
  pageSize: number
  total: number
}

const statusLabels: Record<OrderStatus, string> = {
  AWAITING_PICKUP: 'Created',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  IN_TRANSIT: 'In Transit',
  PICKED_UP: 'Picked Up',
  DELIVERY_FAILED: 'Failed',
  DELIVERED: 'Delivered',
}

const statusClass: Record<OrderStatus, string> = {
  AWAITING_PICKUP: styles.created,
  OUT_FOR_DELIVERY: styles.outForDelivery,
  IN_TRANSIT: styles.inTransit,
  PICKED_UP: styles.pickedUp,
  DELIVERY_FAILED: styles.failed,
  DELIVERED: styles.delivered,
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatSizeWeight(order: MerchantOrder) {
  const size = order.packageSize ? `${order.packageSize[0]}` : '-'
  return `${size} · ${order.weightKg ?? '-'} kg`
}

function getLocalToday() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const MerchantOrdersPage: React.FC = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('All statuses')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(6)
  const [orders, setOrders] = useState<MerchantOrder[]>([])
  const [total, setTotal] = useState(0)
  const [metrics, setMetrics] = useState<MerchantDashboardResponse['metrics'] | null>(null)
  const [reportingPeriod, setReportingPeriod] = useState<{ month: number; year: number } | null>(null)
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const today = getLocalToday()

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      setLoadError(null)
      try {
        const status =
          selectedStatus === 'All statuses'
            ? undefined
            : (selectedStatus === 'Created'
                ? 'AWAITING_PICKUP'
                : selectedStatus === 'Out for Delivery'
                  ? 'OUT_FOR_DELIVERY'
                  : selectedStatus === 'In Transit'
                    ? 'IN_TRANSIT'
                    : selectedStatus === 'Picked Up'
                      ? 'PICKED_UP'
                      : selectedStatus === 'Failed'
                        ? 'DELIVERY_FAILED'
                        : 'DELIVERED') as OrderStatus | undefined

        const [dashboard, ordersPage] = await Promise.all([
          apiRequest<MerchantDashboardResponse>('/merchant/dashboard', { signal: controller.signal }),
          apiRequest<MerchantOrdersPageResponse>('/merchant/orders', {
            query: {
              search: search.trim() || undefined,
              status,
              page,
              pageSize,
              createdFrom: createdFrom || undefined,
              createdTo: createdTo || undefined,
            },
            signal: controller.signal,
          }),
        ])

        if (controller.signal.aborted) return
        setMetrics(dashboard.metrics)
        setReportingPeriod(dashboard.reportingPeriod)
        setOrders(ordersPage.data)
        setTotal(ordersPage.total)
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load merchant orders.')
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [search, selectedStatus, page, pageSize, createdFrom, createdTo])


  const exportCsv = async () => {
    const status =
      selectedStatus === 'All statuses'
        ? undefined
        : selectedStatus === 'Created'
          ? 'AWAITING_PICKUP'
          : selectedStatus === 'Out for Delivery'
            ? 'OUT_FOR_DELIVERY'
            : selectedStatus === 'In Transit'
              ? 'IN_TRANSIT'
              : selectedStatus === 'Picked Up'
                ? 'PICKED_UP'
                : selectedStatus === 'Failed'
                  ? 'DELIVERY_FAILED'
                  : 'DELIVERED'

    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (status) params.set('status', status)
    if (createdFrom) params.set('createdFrom', createdFrom)
    if (createdTo) params.set('createdTo', createdTo)

    const url = `${appEnv.apiBaseUrl}/merchant/orders/export${params.size ? `?${params.toString()}` : ''}`
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) throw new Error('Unable to export merchant orders.')
    const blob = await response.blob()
    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = 'merchant-orders.csv'
    anchor.click()
    URL.revokeObjectURL(downloadUrl)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const reportingMonth = reportingPeriod
    ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(
        new Date(reportingPeriod.year, reportingPeriod.month - 1),
      )
    : ''

  const dateRangeLabel = (() => {
    const formatRangeDate = (value: string) =>
      new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(`${value}T00:00:00`))

    if (createdFrom && createdTo) {
      return `${formatRangeDate(createdFrom)} – ${formatRangeDate(createdTo)}`
    }
    if (createdFrom) return `From ${formatRangeDate(createdFrom)}`
    if (createdTo) return `To ${formatRangeDate(createdTo)}`
    return 'Select date range'
  })()

  return (
    <div className={styles.page}>
      <header><h1>Orders</h1><p>View and track all your business deliveries.</p></header>
      <section className={styles.metrics} aria-label="Order summary">
        <div className={styles.metricCard}><div className={`${styles.metricIcon} ${styles.green}`}><Package size={21} /></div><div><span>ACTIVE DELIVERIES</span><strong>{metrics?.activeDeliveries ?? 0}</strong><small>All active orders</small></div></div>
        <div className={styles.metricCard}><div className={`${styles.metricIcon} ${styles.mint}`}><Package size={21} /></div><div><span>DELIVERED THIS MONTH</span><strong>{metrics?.deliveredThisMonth ?? 0}</strong><small>{reportingMonth}</small></div></div>
        <div className={styles.metricCard}><div className={`${styles.metricIcon} ${styles.yellow}`}><TriangleAlert size={20} /></div><div><span>NEEDS ATTENTION</span><strong>{metrics?.needsAttention ?? 0}</strong><small>Failed delivery attempts</small></div></div>
      </section>
      <section className={styles.ordersCard}>
        <div className={styles.cardHeader}><h2>All orders</h2><button type="button" className={styles.export} onClick={() => void exportCsv()}><Download size={14} /> Export CSV</button></div>
        <div className={styles.filters}>
          <label className={styles.search}><Search size={14} /><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value) }} placeholder="Search tracking number, order or recipient" aria-label="Search orders" /></label>
          <label className={styles.select}><select value={selectedStatus} onChange={(event) => { setPage(1); setSelectedStatus(event.target.value) }}><option>All statuses</option>{(['Created', 'Out for Delivery', 'In Transit', 'Picked Up', 'Failed', 'Delivered'] as const).map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label>
          <div className={styles.dateRange}>
            <button
              type="button"
              className={styles.dateRangeButton}
              aria-expanded={isDateRangeOpen}
              onClick={() => setIsDateRangeOpen((isOpen) => !isOpen)}
            >
              <CalendarDays size={13} />
              <span>{dateRangeLabel}</span>
              <ChevronDown size={13} />
            </button>
            {isDateRangeOpen && (
              <div className={styles.datePopover} role="dialog" aria-label="Filter by date range">
                <label>
                  <span>Created from</span>
                  <input type="date" max={createdTo || today} value={createdFrom} onChange={(event) => { setPage(1); setCreatedFrom(event.target.value) }} />
                </label>
                <label>
                  <span>Created to</span>
                  <input type="date" min={createdFrom || undefined} max={today} value={createdTo} onChange={(event) => { setPage(1); setCreatedTo(event.target.value) }} />
                </label>
                <div className={styles.dateActions}>
                  <button type="button" onClick={() => { setPage(1); setCreatedFrom(''); setCreatedTo('') }}>Clear</button>
                  <button type="button" onClick={() => setIsDateRangeOpen(false)}>Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className={styles.tableWrapper}>
          <table><thead><tr><th>TRACKING<br />NO.</th><th>ORDER<br />REF</th><th>RECIPIENT</th><th>DROP-OFF<br />ADDRESS</th><th>SIZE /<br />WEIGHT</th><th>FEE</th><th>STATUS</th><th>CREATED</th><th>SOURCE</th></tr></thead>
            <tbody>{orders.map((order) => <tr key={order.id} className={styles.orderRow} onClick={() => navigate(`/merchant/track/${order.trackingNumber}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate(`/merchant/track/${order.trackingNumber}`) }} tabIndex={0}><td className={styles.strong}>{order.trackingNumber}</td><td>{order.reference}</td><td className={styles.recipient}>{order.recipient}</td><td>{order.destination}</td><td>{formatSizeWeight(order)}</td><td className={styles.strong}>{order.feeLkr == null ? '-' : `LKR ${order.feeLkr}`}</td><td><span className={`${styles.status} ${statusClass[order.status]}`}>{statusLabels[order.status]}</span></td><td>{formatDate(order.createdAt)}</td><td>{order.source}</td></tr>)}</tbody>
          </table>
        </div>
        {loadError && <p role="alert">{loadError}</p>}
        <footer className={styles.pagination}><span>Showing <strong>{start}–{end}</strong> of <strong>{total}</strong> orders</span><div><span>Rows per page</span><select value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)) }}><option value={6}>6</option><option value={12}>12</option><option value={20}>20</option></select><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>{Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map((pageNumber) => <button type="button" key={pageNumber} className={pageNumber === page ? styles.current : ''} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}<button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer>
      </section>
    </div>
  )
}

export default MerchantOrdersPage
