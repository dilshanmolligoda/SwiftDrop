import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  ImageOff,
  RefreshCw,
  Search,
  Truck,
  X,
} from 'lucide-react'
import { apiRequest } from '../../../api/client'
import styles from './MerchantTrackParcelPage.module.css'

type TrackingStatus =
  | 'AWAITING_PICKUP'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'

interface MerchantOrderDetail {
  id: string
  reference: string
  trackingNumber: string
  recipient: string
  destination: string
  packageSize: 'SMALL' | 'MEDIUM' | 'LARGE' | null
  weightKg: number | null
  feeLkr: number | null
  status: TrackingStatus
  source: 'API' | 'PORTAL'
  createdAt: string
  failedDeliveryAttempts: number
  updatedAt: string
  timeline: Array<{
    status: string
    note: string | null
    failureReason: string | null
    createdAt: string
  }>
  failureReason: string | null
  proof: {
    id: string
    originalFilename: string
    contentType: string
    sizeBytes: number
    uploadedAt: string
  } | null
}

interface MerchantOrdersPage {
  data: MerchantOrderDetail[]
  page: number
  pageSize: number
  total: number
}

const statusLabels: Record<TrackingStatus, string> = {
  AWAITING_PICKUP: 'Awaiting pickup',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery failed',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Colombo',
  }).format(new Date(value))
}

function formatSizeWeight(order: MerchantOrderDetail) {
  const size = order.packageSize
    ? order.packageSize === 'SMALL'
      ? 'S'
      : order.packageSize === 'MEDIUM'
        ? 'M'
        : 'L'
    : '-'
  return `${size} · ${order.weightKg ?? '-'} kg`
}

function timelineLabel(status: string) {
  const labels: Record<string, string> = {
    CREATED: 'Created',
    PENDING: 'Created',
    ASSIGNED: 'Created',
    AWAITING_PICKUP: 'Created',
    PICKED_UP: 'Picked up',
    IN_TRANSIT: 'In transit',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    FAILED: 'Delivery failed',
    DELIVERY_FAILED: 'Delivery failed',
  }
  return labels[status] ?? status
}

export default function MerchantTrackParcelPage() {
  const navigate = useNavigate()
  const { trackingNumber } = useParams()
  const [trackingQuery, setTrackingQuery] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [recentOrders, setRecentOrders] = useState<MerchantOrderDetail[]>([])
  const [order, setOrder] = useState<MerchantOrderDetail | null>(null)
  const [loading, setLoading] = useState(Boolean(trackingNumber))
  const [notFound, setNotFound] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadTracking = async (number: string) => {
    setLoading(true)
    setNotFound(false)
    setOrder(null)
    try {
      const result = await apiRequest<MerchantOrderDetail>(
        `/merchant/track/${encodeURIComponent(number.trim().toUpperCase())}`,
      )
      setOrder(result)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (trackingNumber) {
      let active = true
      apiRequest<MerchantOrderDetail>(
        `/merchant/track/${encodeURIComponent(trackingNumber.trim().toUpperCase())}`,
      )
        .then((result) => {
          if (active) setOrder(result)
        })
        .catch(() => {
          if (active) setNotFound(true)
        })
        .finally(() => {
          if (active) setLoading(false)
        })
      return () => {
        active = false
      }
    }

    let active = true
    apiRequest<MerchantOrdersPage>('/merchant/orders', {
      query: { page: 1, pageSize: 6 },
    })
      .then((result) => {
        if (active) setRecentOrders(result.data as MerchantOrderDetail[])
      })
      .catch(() => {
        if (active) setRecentOrders([])
      })
    return () => {
      active = false
    }
  }, [trackingNumber])

  const submitTrackingSearch = async (event: FormEvent) => {
    event.preventDefault()
    const normalized = trackingQuery.trim().toUpperCase()
    if (!normalized) {
      setSearchError('Enter a tracking number.')
      return
    }

    try {
      const result = await apiRequest<MerchantOrdersPage>('/merchant/orders', {
        query: { search: normalized, page: 1, pageSize: 100 },
      })
      const exact = result.data.find(
        (item) => item.trackingNumber.toUpperCase() === normalized,
      )
      if (!exact) {
        setSearchError('No parcel was found for this tracking number.')
        return
      }
      setSearchError(null)
      navigate(`/merchant/track/${encodeURIComponent(exact.trackingNumber)}`)
    } catch {
      setSearchError('Unable to search for that tracking number.')
    }
  }

  const copyTrackingLink = async () => {
    if (!order) return
    const link = `${window.location.origin}/merchant/track/${order.trackingNumber}`
    try {
      await navigator.clipboard.writeText(link)
      setToast('Tracking link copied')
    } catch {
      setToast('Unable to copy tracking link')
    }
  }

  const currentMessage = useMemo(() => {
    if (!order) return ''
    if (order.status === 'DELIVERED') return 'Your parcel was delivered successfully.'
    if (order.status === 'DELIVERY_FAILED') return 'Your parcel could not be delivered.'
    if (order.status === 'OUT_FOR_DELIVERY') return 'Your parcel is on its way to the recipient.'
    if (order.status === 'IN_TRANSIT') return 'Your parcel is in transit.'
    if (order.status === 'PICKED_UP') return 'Your parcel has been picked up.'
    return 'Your parcel is awaiting pickup.'
  }, [order])

  if (!trackingNumber) {
    return (
      <div className={styles.page}>
        <div className={styles.headingRow}>
          <div>
            <h1>Track a parcel</h1>
            <p>Enter a tracking number to view delivery progress.</p>
          </div>
        </div>
        <section className={styles.searchCard}>
          <form className={styles.searchForm} onSubmit={(event) => void submitTrackingSearch(event)}>
            <label htmlFor="tracking-search">Tracking number</label>
            <div className={styles.searchRow}>
              <span className={styles.searchIcon}><Search size={16} /></span>
              <input
                id="tracking-search"
                type="search"
                value={trackingQuery}
                onChange={(event) => {
                  setTrackingQuery(event.target.value)
                  setSearchError(null)
                }}
                placeholder="Enter tracking number"
              />
              <button type="submit">Track parcel</button>
            </div>
            {searchError && <p className={styles.searchError} role="alert">{searchError}</p>}
          </form>
        </section>
        <section className={styles.recentSearches}>
          <h2>Recent parcels</h2>
          {recentOrders.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => navigate(`/merchant/track/${item.trackingNumber}`)}
            >
              <span>
                <strong>{item.trackingNumber}</strong>
                <small>{item.recipient} · {item.reference}</small>
              </span>
              <span className={`${styles.statusBadge} ${item.status === 'DELIVERY_FAILED' ? styles.statusBadgeFailed : item.status === 'DELIVERED' ? styles.statusBadgeDelivered : ''}`}>
                {statusLabels[item.status]}
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </section>
      </div>
    )
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <section className={styles.searchCard}>Loading tracking information...</section>
      </main>
    )
  }

  if (notFound || !order) {
    return (
      <div className={styles.page}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/merchant/track')}>
          <ArrowLeft size={12} />
          Back to tracking search
        </button>
        <section className={styles.searchCard}>
          <h1>Parcel not found</h1>
          <p>No parcel was found for tracking number <strong>{trackingNumber}</strong>.</p>
          <button type="button" className={styles.outlineButton} onClick={() => navigate('/merchant/track')}>
            Search again
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <button type="button" className={styles.backButton} onClick={() => navigate('/merchant/orders')}>
        <ArrowLeft size={12} />
        Back to orders
      </button>

      <div className={styles.headingRow}>
        <div>
          <h1>Track a parcel</h1>
          <p>Follow your parcel and share updates with your buyer.</p>
        </div>
        <div className={styles.headingActions}>
          <button type="button" className={styles.outlineButton} onClick={() => void copyTrackingLink()}>
            <Copy size={13} />
            Copy tracking link
          </button>
          <button type="button" className={styles.outlineButton} onClick={() => window.open(`/merchant/track/${order.trackingNumber}`, '_blank')}>
            Buyer view
            <ExternalLink size={12} />
          </button>
        </div>
      </div>

      <section className={styles.trackingCard}>
        <div className={styles.trackingHeader}>
          <div>
            <span className={styles.trackingLabel}>Tracking number</span>
            <div className={styles.trackingNumberRow}>
              <strong>{order.trackingNumber}</strong>
              <button type="button" className={styles.copyIcon} aria-label="Copy tracking number" onClick={() => void copyTrackingLink()}>
                <Copy size={12} />
              </button>
              <span className={styles.orderRef}>Order ref: {order.reference}</span>
            </div>
          </div>
          <span className={`${styles.statusBadge} ${order.status === 'DELIVERED' ? styles.statusBadgeDelivered : order.status === 'DELIVERY_FAILED' ? styles.statusBadgeFailed : ''}`}>
            <Truck size={13} />
            {statusLabels[order.status]}
          </span>
        </div>

        <div className={styles.currentStatus}>
          <span className={styles.currentStatusIcon}><Truck size={16} /></span>
          <div>
            <strong>{currentMessage}</strong>
            {order.status !== 'DELIVERED' && order.status !== 'DELIVERY_FAILED' && (
              <p><CalendarDays size={11} /> Estimated delivery will be available when confirmed.</p>
            )}
            {order.status === 'DELIVERY_FAILED' && <p>{order.failureReason ?? 'Failure reason not available.'}</p>}
            <div className={styles.currentStatusMeta}>
              <span>Last updated: {formatDate(order.updatedAt)}</span>
            </div>
          </div>
        </div>

        <div className={styles.trackingFooter}>
          <span>Last updated: {formatDate(order.updatedAt)}</span>
          <button type="button" className={styles.refreshButton} onClick={() => void loadTracking(order.trackingNumber)}>
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.timelineCard}>
          <h2 className={styles.sectionTitle}><Clock3 size={14} />Delivery timeline</h2>
          <ol className={styles.timeline}>
            {order.timeline.length > 0 ? order.timeline.map((event) => {
              const failed = event.status === 'FAILED' || event.status === 'DELIVERY_FAILED'
              return (
                <li key={`${event.status}-${event.createdAt}`} className={`${styles.timelineItem} ${failed ? styles.timelineItemFailed : styles.timelineItemComplete}`}>
                  <span className={styles.timelineIcon}>{failed ? <X size={10} /> : <Check size={10} />}</span>
                  <div className={styles.timelineCopy}>
                    <strong>{timelineLabel(event.status)}</strong>
                    <span>{formatDate(event.createdAt)}</span>
                    {event.note && <span>{event.note}</span>}
                  </div>
                </li>
              )
            }) : (
              <li className={`${styles.timelineItem} ${styles.timelineItemComplete}`}>
                <span className={styles.timelineIcon}><Check size={10} /></span>
                <div className={styles.timelineCopy}>
                  <strong>{statusLabels[order.status]}</strong>
                  <span>{formatDate(order.createdAt)}</span>
                </div>
              </li>
            )}
          </ol>
        </section>

        <section className={styles.detailsCard}>
          <h2 className={styles.sectionTitle}><Truck size={14} />Delivery details</h2>
          <dl className={styles.detailRows}>
            <div className={styles.detailRow}><dt>Pickup</dt><dd><strong>Merchant store</strong><span>{order.source}</span></dd></div>
            <div className={styles.detailRow}><dt>Recipient</dt><dd><strong>{order.recipient}</strong><span>{order.destination}</span></dd></div>
            <div className={styles.detailRow}><dt>Parcel</dt><dd><strong>{order.packageSize ?? '-'}</strong><span>{formatSizeWeight(order)}</span></dd></div>
            <div className={styles.detailRow}><dt>Fee</dt><dd><strong>{order.feeLkr == null ? '-' : `LKR ${order.feeLkr}`}</strong></dd></div>
          </dl>
          <div className={styles.proofState}>
            {order.proof ? (
              <><Check size={14} /><span>{order.proof.originalFilename}</span></>
            ) : (
              <><ImageOff size={14} /><span>Proof of delivery is not available.</span></>
            )}
          </div>
        </section>
      </div>

      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </div>
  )
}
