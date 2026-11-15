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
import { env } from '../../../lib/env'
import { MerchantSidebar } from '../components/MerchantSidebar'
import { MERCHANT_DASHBOARD_ORDERS } from '../config/merchant-dashboard.mock'
import type { MerchantOrder, OrderStatus } from '../config/merchant-dashboard.mock'
import styles from './MerchantDashboard.module.css'

interface AuthenticatedUser {
  id: string
  email: string
  fullName: string
  role: 'CUSTOMER' | 'MERCHANT' | 'COURIER' | 'DISPATCHER' | 'ADMIN'
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
}

type StatusFilter = 'ALL' | OrderStatus

const statusLabels: Record<OrderStatus, string> = {
  'Awaiting pickup': 'Awaiting pickup',
  'Out for delivery': 'Out for delivery',
  'In transit': 'In transit',
  'Picked up': 'Picked up',
  'Delivery failed': 'Delivery failed',
  Delivered: 'Delivered',
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

export default function MerchantDashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [showAllOrders, setShowAllOrders] = useState(false)
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

  const filteredOrders = useMemo(() => {
    const orders = showAllOrders
      ? MERCHANT_DASHBOARD_ORDERS
      : MERCHANT_DASHBOARD_ORDERS.slice(0, 6)
    const query = searchQuery.trim().toLowerCase()

    return orders.filter((order) => {
      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter
      const matchesQuery =
        !query ||
        [order.reference, order.trackingNumber, order.recipient, order.destination]
          .some((value) => value.toLowerCase().includes(query))

      return matchesStatus && matchesQuery
    })
  }, [searchQuery, showAllOrders, statusFilter])

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
      setShowAllOrders(false)
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
                <strong>24</strong>
                <span>All active orders</span>
              </div>
            </article>
            <article className={styles.metricCard}>
              <span className={`${styles.metricIcon} ${styles.metricIconGreen}`}>
                <CheckCircle2 size={19} aria-hidden="true" />
              </span>
              <div>
                <p>Delivered this month</p>
                <strong>128</strong>
                <span>{formatMonth()}</span>
              </div>
            </article>
            <article className={styles.metricCard}>
              <span className={`${styles.metricIcon} ${styles.metricIconAmber}`}>
                <AlertTriangle size={19} aria-hidden="true" />
              </span>
              <div>
                <p>Needs attention</p>
                <strong>3</strong>
                <span>Failed delivery attempts</span>
              </div>
            </article>
          </section>

          <section className={styles.ordersCard} id="recent-orders" aria-labelledby="orders-heading">
            <div className={styles.ordersHeader}>
              <h2 id="orders-heading">{showAllOrders ? 'All orders' : 'Recent orders'}</h2>
              <button type="button" className={styles.viewAllButton} onClick={handleViewAllOrders}>
                {showAllOrders ? 'Show recent orders' : 'View all orders'}
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
                      {statusLabels[status as OrderStatus]}
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
                          {order.status}
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
                Showing {filteredOrders.length} {showAllOrders ? 'orders' : 'recent orders'}.
              </p>
            )}
          </section>

          <p className={styles.demoNote}>
            <PackageCheck size={14} aria-hidden="true" />
            Order figures and delivery records are sample data until the merchant orders API is available.
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
            <span className={`${styles.statusBadge} ${styles[selectedOrder.statusClass]}`}>
              {selectedOrder.status}
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
                <dd>{selectedOrder.updated}</dd>
              </div>
              <div>
                <dt>Delivery state</dt>
                <dd>{selectedOrder.status}</dd>
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
