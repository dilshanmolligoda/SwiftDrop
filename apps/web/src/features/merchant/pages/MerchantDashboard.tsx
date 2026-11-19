import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Home,
  MapPin,
  PackageCheck,
  Search,
  X,
} from 'lucide-react'
import { apiRequest } from '../../../api/client'
import { env } from '../../../lib/env'
import { MerchantSidebar } from '../components/MerchantSidebar'
import styles from './MerchantDashboard.module.css'

interface AuthenticatedUser {
  id: string
  email: string
  fullName: string
  role: 'CUSTOMER' | 'MERCHANT' | 'COURIER' | 'DISPATCHER' | 'ADMIN'
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
}

type MerchantOrderStatus =
  | 'AWAITING_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'IN_TRANSIT'
  | 'PICKED_UP'
  | 'DELIVERY_FAILED'
  | 'DELIVERED'

interface MerchantOrder {
  id: string
  reference: string
  trackingNumber: string
  recipient: string
  destination: string
  status: MerchantOrderStatus
  failedDeliveryAttempts: number
  updatedAt: string
}

interface MerchantDashboardResponse {
  reportingPeriod: { month: number; year: number }
  metrics: {
    activeDeliveries: number
    deliveredThisMonth: number
    needsAttention: number
  }
  recentOrders: MerchantOrder[]
}

interface MerchantOrdersPage {
  data: MerchantOrder[]
  page: number
  pageSize: number
  total: number
}

type StatusFilter = 'ALL' | MerchantOrderStatus

const statusLabels: Record<MerchantOrderStatus, string> = {
  AWAITING_PICKUP: 'Awaiting pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  IN_TRANSIT: 'In transit',
  PICKED_UP: 'Picked up',
  DELIVERY_FAILED: 'Delivery failed',
  DELIVERED: 'Delivered',
}

const statusClasses: Record<MerchantOrderStatus, string> = {
  AWAITING_PICKUP: 'statusAwaiting',
  OUT_FOR_DELIVERY: 'statusOutForDelivery',
  IN_TRANSIT: 'statusInTransit',
  PICKED_UP: 'statusPickedUp',
  DELIVERY_FAILED: 'statusFailed',
  DELIVERED: 'statusDelivered',
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function formatMonth() {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date())
}

function formatUpdatedAt(value: string) {
  const updatedAt = new Date(value)
  const elapsedMinutes = Math.floor((Date.now() - updatedAt.getTime()) / 60000)

  if (elapsedMinutes < 1) return 'Just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`
  if (elapsedMinutes < 24 * 60) return `${Math.floor(elapsedMinutes / 60)} hour${Math.floor(elapsedMinutes / 60) === 1 ? '' : 's'} ago`
  if (elapsedMinutes < 48 * 60) return 'Yesterday'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(updatedAt)
}

export default function MerchantDashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [dashboardData, setDashboardData] = useState<MerchantDashboardResponse | null>(null)
  const [orders, setOrders] = useState<MerchantOrder[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [selectedOrder, setSelectedOrder] = useState<MerchantOrder | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    const checkSession = async () => {
      setIsLoading(true)
      setLoadError(null)

      try {
        const response = await fetch(`${env.apiBaseUrl}/auth/me`, {
          method: 'GET',
          credentials: 'include',
        })

        if (!isMounted) return

        if (response.status === 401) {
          navigate('/login', { replace: true })
          return
        }

        if (!response.ok) {
          throw new Error('We could not load your merchant account. Please try again.')
        }

        const userProfile = (await response.json()) as AuthenticatedUser
        if (!isMounted) return

        if (userProfile.approvalStatus === 'PENDING' || userProfile.approvalStatus === 'REJECTED') {
          navigate('/application-status', { replace: true })
          return
        }

        setUser(userProfile)
      } catch (error: unknown) {
        if (isMounted) {
          setLoadError(
            error instanceof TypeError
              ? 'Unable to reach SwiftDrop. Check that the API is running and try again.'
              : error instanceof Error
                ? error.message
                : 'Unable to connect to SwiftDrop. Check your connection and try again.',
          )
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void checkSession()
    return () => {
      isMounted = false
    }
  }, [navigate, retryCount])

  useEffect(() => {
    if (!user) return

    const controller = new AbortController()
    const loadDashboard = async () => {
      try {
        const dashboard = await apiRequest<MerchantDashboardResponse>('/merchant/dashboard', {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return

        setDashboardData(dashboard)
        const hasFilters = searchQuery.trim().length > 0 || statusFilter !== 'ALL'
        if (!hasFilters) {
          setOrders(dashboard.recentOrders)
          return
        }

        const filtered = await apiRequest<MerchantOrdersPage>('/merchant/orders', {
          query: {
            search: searchQuery.trim() || undefined,
            status: statusFilter === 'ALL' ? undefined : statusFilter,
            page: 1,
            pageSize: 6,
          },
          signal: controller.signal,
        })
        if (!controller.signal.aborted) setOrders(filtered.data)
      } catch (error: unknown) {
        if (controller.signal.aborted) return
        setLoadError(error instanceof Error ? error.message : 'Unable to load your merchant dashboard.')
      }
    }

    void loadDashboard()
    return () => controller.abort()
  }, [searchQuery, statusFilter, user])

  const filteredOrders = useMemo(
    () =>
      orders.map((order) => ({
        ...order,
        statusLabel: statusLabels[order.status],
        statusClass: statusClasses[order.status],
        updated: formatUpdatedAt(order.updatedAt),
      })),
    [orders],
  )

  const merchantName = user?.fullName || 'Merchant account'
  const initials = getInitials(merchantName) || 'M'

  const handleLogout = async () => {
    try {
      await fetch(`${env.apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch (error: unknown) {
      console.error('Unable to complete the merchant logout request.', error)
    } finally {
      navigate('/login', { replace: true })
    }
  }

  const handleNavigation = (action: 'dashboard' | 'orders' | 'coming-soon', label: string) => {
    if (action === 'orders') {
      navigate('/merchant/orders')
      return
    }

    if (action === 'dashboard') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setToast(`${label} will be available when that merchant feature is ready.`)
  }

  const handleViewAllOrders = () => {
    navigate('/merchant/orders')
  }

  if (isLoading) {
    return (
      <main className={styles.fullPageState} aria-label="Loading merchant dashboard">
        <div className={styles.loadingCard}>
          <div className={styles.spinner} aria-hidden="true" />
          <p>Loading your dashboard…</p>
        </div>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className={styles.fullPageState}>
        <section className={styles.errorCard} role="alert">
          <div className={styles.errorIcon}>
            <AlertTriangle size={22} aria-hidden="true" />
          </div>
          <h1>Dashboard unavailable</h1>
          <p>{loadError}</p>
          <button type="button" className={styles.primaryButton} onClick={() => setRetryCount((count) => count + 1)}>
            Try again
          </button>
          <button type="button" className={styles.textButton} onClick={() => void handleLogout()}>
            Sign out
          </button>
        </section>
      </main>
    )
  }

  return (
    <div className={styles.dashboard}>
      <MerchantSidebar
        merchantName={merchantName}
        onLogout={() => void handleLogout()}
        onAction={handleNavigation}
        onCreateDelivery={() => setToast('Delivery creation will be available when the merchant order service is ready.')}
      />

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <Home size={14} aria-hidden="true" />
            <ChevronRight size={13} aria-hidden="true" />
            <span>Dashboard</span>
          </div>

          <div className={styles.topbarActions}>
            <div className={styles.popoverAnchor}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Notifications"
                aria-expanded={isNotificationsOpen}
                onClick={() => setIsNotificationsOpen((isOpen) => !isOpen)}
              >
                <Bell size={17} aria-hidden="true" />
                <span className={styles.notificationDot} />
              </button>
              {isNotificationsOpen && (
                <div className={styles.notificationPopover} role="status">
                  <strong>You’re all caught up</strong>
                  <span>New delivery updates will appear here.</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className={styles.topbarAccount}
              aria-expanded={isAccountMenuOpen}
              onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
            >
              <span className={styles.avatar}>{initials}</span>
              <span>{merchantName}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.pageHeading}>
            <div>
              <h1>Dashboard</h1>
              <p>Monitor your orders and delivery progress.</p>
            </div>
          </section>

          <section className={styles.metrics} aria-label="Delivery summary">
            <article className={styles.metricCard}>
              <span className={`${styles.metricIcon} ${styles.metricIconGreen}`}>
                <Box size={19} aria-hidden="true" />
              </span>
              <div>
                <p>Active deliveries</p>
                <strong>{dashboardData?.metrics.activeDeliveries ?? 0}</strong>
                <span>All active orders</span>
              </div>
            </article>
            <article className={styles.metricCard}>
              <span className={`${styles.metricIcon} ${styles.metricIconGreen}`}>
                <CheckCircle2 size={19} aria-hidden="true" />
              </span>
              <div>
                <p>Delivered this month</p>
                <strong>{dashboardData?.metrics.deliveredThisMonth ?? 0}</strong>
                  <span>{dashboardData ? `${new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(dashboardData.reportingPeriod.year, dashboardData.reportingPeriod.month - 1))}` : formatMonth()}</span>
              </div>
            </article>
            <article className={styles.metricCard}>
              <span className={`${styles.metricIcon} ${styles.metricIconAmber}`}>
                <AlertTriangle size={19} aria-hidden="true" />
              </span>
              <div>
                <p>Needs attention</p>
                <strong>{dashboardData?.metrics.needsAttention ?? 0}</strong>
                <span>Failed delivery attempts</span>
              </div>
            </article>
          </section>

          <section className={styles.ordersCard} id="recent-orders" aria-labelledby="orders-heading">
            <div className={styles.ordersHeader}>
              <h2 id="orders-heading">Recent orders</h2>
              <button type="button" className={styles.viewAllButton} onClick={handleViewAllOrders}>
                View all orders
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.filters}>
              <label className={styles.searchBox}>
                <Search size={15} aria-hidden="true" />
                <span className={styles.visuallyHidden}>Search orders</span>
                <input
                  type="search"
                  placeholder="Search order or tracking number"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className={styles.clearSearch}
                    aria-label="Clear search"
                    onClick={() => setSearchQuery('')}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </label>

              <label className={styles.statusSelect}>
                <span className={styles.visuallyHidden}>Filter by status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                >
                  <option value="ALL">Status</option>
                  {Object.keys(statusLabels).map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status as MerchantOrderStatus]}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </label>
            </div>

            <div className={styles.tableScroller}>
              <table className={styles.ordersTable}>
                <thead>
                  <tr>
                    <th scope="col">Order reference</th>
                    <th scope="col">Tracking number</th>
                    <th scope="col">Recipient</th>
                    <th scope="col">Destination</th>
                    <th scope="col">Status</th>
                    <th scope="col">Updated</th>
                    <th scope="col">
                      <span className={styles.visuallyHidden}>Order details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.reference}>
                      <td>{order.reference}</td>
                      <td>{order.trackingNumber}</td>
                      <td className={styles.recipientCell}>{order.recipient}</td>
                      <td className={styles.destinationCell}>
                        <span className={styles.mobileLocationIcon}>
                          <MapPin size={13} aria-hidden="true" />
                        </span>
                        {order.destination}
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[order.statusClass]}`}>
                          {order.statusLabel}
                        </span>
                      </td>
                      <td className={styles.updatedCell}>{order.updated}</td>
                      <td className={styles.detailsCell}>
                        <button
                          type="button"
                          className={styles.detailsButton}
                          aria-label={`View order ${order.reference}`}
                          onClick={() => setSelectedOrder(order)}
                        >
                          <ChevronRight size={17} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredOrders.length === 0 ? (
              <div className={styles.emptyState}>
                <Search size={20} aria-hidden="true" />
                <strong>No matching orders</strong>
                <span>Try a different search or status filter.</span>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => {
                    setSearchQuery('')
                    setStatusFilter('ALL')
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <p className={styles.tableFootnote}>
                Showing {filteredOrders.length} recent orders.
              </p>
            )}
          </section>

          <p className={styles.demoNote}>
            <PackageCheck size={14} aria-hidden="true" />
            Recent orders and delivery metrics are loaded from the merchant dashboard API.
          </p>
        </div>
      </main>

      {toast && (
        <div className={styles.toast} role="status">
          <span>{toast}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setToast(null)}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      {selectedOrder && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedOrder(null)
          }}
        >
          <section
            className={styles.orderDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-dialog-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <span className={styles.dialogEyebrow}>Order details</span>
                <h2 id="order-dialog-title">{selectedOrder.reference}</h2>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Close order details"
                onClick={() => setSelectedOrder(null)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <span className={`${styles.statusBadge} ${styles[statusClasses[selectedOrder.status]]}`}>
              {statusLabels[selectedOrder.status]}
            </span>
            <dl className={styles.orderDetails}>
              <div>
                <dt>Tracking number</dt>
                <dd>{selectedOrder.trackingNumber}</dd>
              </div>
              <div>
                <dt>Recipient</dt>
                <dd>{selectedOrder.recipient}</dd>
              </div>
              <div>
                <dt>Destination</dt>
                <dd>{selectedOrder.destination}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatUpdatedAt(selectedOrder.updatedAt)}</dd>
              </div>
              <div>
                <dt>Delivery state</dt>
                <dd>{statusLabels[selectedOrder.status]}</dd>
              </div>
              <div>
                <dt>Delivery reference</dt>
                <dd>{selectedOrder.reference}</dd>
              </div>
            </dl>
            <button type="button" className={styles.dialogCloseButton} onClick={() => setSelectedOrder(null)}>
              Close
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
