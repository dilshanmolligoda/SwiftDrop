import React, { useState, useMemo, useEffect } from 'react'
import {
  Package,
  Truck,
  CheckCircle2,
  Search,
  Home,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import type { DeliveryItem, DeliveryStatus } from '../types/admin-deliveries.types'
import { AssignCourierDrawer } from '../components/AssignCourierDrawer'
import { AdminFilterSelect } from '../components/AdminFilterSelect'
import { adminApi, type AdminDeliveryItem, type AdminDashboardKpis } from '../api/admin-api'
import styles from './AdminDeliveriesPage.module.css'

type FilterTab = 'all' | 'unassigned' | 'in_progress' | 'delivered' | 'failed'

function mapBackendStatusToDisplay(status: string): DeliveryStatus {
  switch (status) {
    case 'CREATED':
    case 'PENDING':
      return 'New delivery'
    case 'ASSIGNED':
    case 'PICKED_UP':
    case 'IN_TRANSIT':
      return 'In transit'
    case 'OUT_FOR_DELIVERY':
      return 'Out for delivery'
    case 'DELIVERED':
      return 'Delivered'
    case 'FAILED':
    case 'RETURNED':
      return 'Failed attempt'
    default:
      return (status as DeliveryStatus) || 'New delivery'
  }
}

function calculateWaitingTime(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  if (diffMinutes < 60) return `${Math.max(1, diffMinutes)}m`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ${diffMinutes % 60}m`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ${diffHours % 24}h`
}

export const AdminDeliveriesPage: React.FC = () => {
  const [deliveries, setDeliveries] = useState<AdminDeliveryItem[]>([])
  const [kpis, setKpis] = useState<AdminDashboardKpis | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedForAssign, setSelectedForAssign] = useState<DeliveryItem | null>(null)
  const [isAssignDrawerOpen, setIsAssignDrawerOpen] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const [reloadTrigger, setReloadTrigger] = useState(0)

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()

    async function fetchData() {
      try {
        const [deliveriesRes, dashboardRes] = await Promise.all([
          adminApi.getDeliveries({
            page,
            limit,
            search: searchQuery.trim() || undefined,
          }),
          adminApi.getDashboard(controller.signal),
        ])
        if (!isMounted) return
        setDeliveries(deliveriesRes.data || [])
        setTotalPages(deliveriesRes.pagination?.totalPages || 1)
        setTotalCount(deliveriesRes.pagination?.total || 0)
        setKpis(dashboardRes.kpis)
      } catch (err: unknown) {
        if (!isMounted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('Failed to load deliveries:', err)
        setError('Could not load deliveries from backend.')
        setDeliveries([])
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void fetchData()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [page, limit, searchQuery, reloadTrigger])

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((item) => {
      const hasCourier = Boolean(item.activeAssignment?.courier)
      const displayStatus = mapBackendStatusToDisplay(item.status)

      // Tab filter
      if (activeTab === 'unassigned' && hasCourier) return false
      if (activeTab === 'in_progress' && displayStatus !== 'In transit' && displayStatus !== 'Out for delivery') {
        return false
      }
      if (activeTab === 'delivered' && displayStatus !== 'Delivered') return false
      if (activeTab === 'failed' && displayStatus !== 'Failed attempt') return false

      // Status dropdown filter
      if (statusFilter !== 'all' && displayStatus !== statusFilter) return false

      return true
    })
  }, [deliveries, activeTab, statusFilter])

  const handleOpenAssign = (item: AdminDeliveryItem) => {
    const formattedItem: DeliveryItem = {
      id: item.id,
      trackingNo: item.trackingNumber,
      recipient: item.recipientName,
      pickup: item.senderAddress,
      dropoff: item.recipientAddress,
      pickupAddress: item.senderAddress,
      dropoffAddress: item.recipientAddress,
      weightKg: Number(item.weightKg) || 0,
      size: item.packageSize as any,
      dimensions: 'Standard package',
      status: mapBackendStatusToDisplay(item.status),
      courierName: item.activeAssignment?.courier?.fullName || null,
      courierId: item.activeAssignment?.courier?.id || null,
      waitingTime: calculateWaitingTime(item.createdAt),
      zone: item.recipientAddress,
      createdAt: item.createdAt,
    }
    setSelectedForAssign(formattedItem)
    setIsAssignDrawerOpen(true)
  }

  const handleAssignCourier = async (deliveryId: string, courierId: string) => {
    try {
      const result = await adminApi.assignCourier(deliveryId, courierId)
      setFeedbackMessage(`Assigned to ${result.courierName} successfully!`)
      setIsAssignDrawerOpen(false)
      setSelectedForAssign(null)
      setReloadTrigger((v) => v + 1)
      setTimeout(() => setFeedbackMessage(null), 4000)
    } catch (err: any) {
      console.error('Assign courier failed:', err)
      alert(err.message || 'Failed to assign courier. Please try again.')
    }
  }

  const renderStatusBadge = (status: DeliveryStatus) => {
    switch (status) {
      case 'Failed attempt':
        return <span className={`${styles.statusBadge} ${styles.statusFailed}`}>{status}</span>
      case 'New delivery':
        return <span className={`${styles.statusBadge} ${styles.statusNew}`}>{status}</span>
      case 'Out for delivery':
        return (
          <span className={`${styles.statusBadge} ${styles.statusOutForDelivery}`}>{status}</span>
        )
      case 'In transit':
        return <span className={`${styles.statusBadge} ${styles.statusInTransit}`}>{status}</span>
      case 'Delivered':
        return <span className={`${styles.statusBadge} ${styles.statusDelivered}`}>{status}</span>
      default:
        return <span className={styles.statusBadge}>{status}</span>
    }
  }

  return (
    <div className={styles.pageContainer}>
      {/* Header and Breadcrumb */}
      <div className={styles.pageHeader}>
        <div className={styles.breadcrumb} aria-label="Breadcrumb">
          <Home size={14} aria-hidden="true" />
          <ChevronRight size={12} aria-hidden="true" />
          <span className={styles.breadcrumbCurrent}>Deliveries</span>
        </div>
        <h1 className={styles.pageTitle}>Deliveries</h1>
        <p className={styles.pageSubtitle}>Assign and monitor parcels in one place.</p>
      </div>

      {feedbackMessage && (
        <div style={{ backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '14px', fontWeight: 500 }}>
          {feedbackMessage}
        </div>
      )}

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 3 Metric KPI Cards */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconOrange}`}>
            <Package size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Unassigned</span>
            <span className={styles.metricValue}>{kpis?.pendingDispatch ?? 0}</span>
            <span className={styles.metricSubtext}>Waiting for a courier</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGreen}`}>
            <Truck size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Active deliveries</span>
            <span className={styles.metricValue}>{kpis?.activeInTransit ?? 0}</span>
            <span className={styles.metricSubtext}>Assigned and in progress</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGreen}`}>
            <CheckCircle2 size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Delivered today</span>
            <span className={styles.metricValue}>{kpis?.deliveredToday ?? 0}</span>
            <span className={styles.metricSubtext}>Completed today</span>
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className={styles.contentCard}>
        {/* Filter Tabs */}
        <div className={styles.tabsRow} role="tablist" aria-label="Deliveries status tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`${styles.tabButton} ${activeTab === 'all' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All deliveries
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'unassigned'}
            className={`${styles.tabButton} ${
              activeTab === 'unassigned' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('unassigned')}
          >
            Unassigned ({kpis?.pendingDispatch ?? 0})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'in_progress'}
            className={`${styles.tabButton} ${
              activeTab === 'in_progress' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('in_progress')}
          >
            In progress ({kpis?.activeInTransit ?? 0})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'delivered'}
            className={`${styles.tabButton} ${
              activeTab === 'delivered' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('delivered')}
          >
            Delivered ({kpis?.deliveredToday ?? 0})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'failed'}
            className={`${styles.tabButton} ${activeTab === 'failed' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('failed')}
          >
            Failed attempts ({kpis?.failedAttempts ?? 0})
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className={styles.filterBar}>
          <div className={styles.searchInputWrapper}>
            <Search size={16} className={styles.searchIcon} aria-hidden="true" />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search tracking or recipient"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              aria-label="Search tracking or recipient"
            />
          </div>

          <div className={styles.dropdownGroup}>
            <AdminFilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              ariaLabel="Filter by status"
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'Failed attempt', label: 'Failed attempt' },
                { value: 'New delivery', label: 'New delivery' },
                { value: 'Out for delivery', label: 'Out for delivery' },
                { value: 'In transit', label: 'In transit' },
                { value: 'Delivered', label: 'Delivered' },
              ]}
            />
          </div>
        </div>

        {/* Deliveries Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.deliveriesTable}>
            <thead>
              <tr>
                <th scope="col">Tracking / Recipient</th>
                <th scope="col">Pickup → Drop-off</th>
                <th scope="col">Parcel</th>
                <th scope="col">Status</th>
                <th scope="col">Courier</th>
                <th scope="col">Waiting *</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Loading deliveries...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredDeliveries.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    No deliveries found in the database.
                  </td>
                </tr>
              ) : (
                filteredDeliveries.map((item) => {
                  const displayStatus = mapBackendStatusToDisplay(item.status)
                  const courier = item.activeAssignment?.courier
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className={styles.trackingCell}>
                          <span className={styles.trackingNo}>{item.trackingNumber}</span>
                          {item.orderReference && (
                            <span className={styles.orderRefBadge}>Ref: {item.orderReference}</span>
                          )}
                          <span className={styles.recipientText}>{item.recipientName}</span>
                        </div>
                      </td>
                      <td>
                        <span className={styles.routeText}>
                          {item.senderAddress}
                          <span className={styles.routeArrow} aria-hidden="true">→</span>
                          {item.recipientAddress}
                        </span>
                      </td>
                      <td>
                        <span className={styles.parcelSpecs}>
                          {item.weightKg} kg • {item.packageSize}
                        </span>
                      </td>
                      <td>
                        {renderStatusBadge(displayStatus)}
                        {item.failureReason && displayStatus === 'Failed attempt' && (
                          <span className={styles.failureReasonText}>{item.failureReason}</span>
                        )}
                      </td>
                      <td>
                        {courier ? (
                          <span className={styles.courierText}>{courier.fullName}</span>
                        ) : (
                          <span className={styles.unassignedText}>Unassigned</span>
                        )}
                      </td>
                      <td>
                        <span className={styles.waitingTime}>
                          {displayStatus === 'Delivered' ? '—' : calculateWaitingTime(item.createdAt)}
                        </span>
                      </td>
                      <td>
                        {displayStatus === 'Delivered' ? (
                          <span className={styles.completedText} title="Delivery completed">—</span>
                        ) : !courier ? (
                          <button
                            type="button"
                            className={styles.assignButton}
                            onClick={() => handleOpenAssign(item)}
                          >
                            Assign
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.viewDetailsLink}
                            onClick={() => handleOpenAssign(item)}
                          >
                            Reassign →
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className={styles.tableFooter}>
          <p className={styles.footerNote}>* Waiting: Time since parcel was created.</p>

          <div className={styles.paginationControls}>
            <span className={styles.paginationText}>
              Showing {filteredDeliveries.length} of {totalCount} deliveries
            </span>
            <AdminFilterSelect
              value={String(limit)}
              onChange={(val) => {
                setLimit(Number(val))
                setPage(1)
              }}
              ariaLabel="Rows per page"
              direction="up"
              compact
              options={[
                { value: '5', label: '5 per page' },
                { value: '10', label: '10 per page' },
                { value: '20', label: '20 per page' },
              ]}
            />

            <div className={styles.pagesList}>
              <button
                type="button"
                className={styles.pageBtn}
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <span style={{ padding: '0 8px', fontSize: '13px', color: '#475569' }}>
                Page {page} of {Math.max(1, totalPages)}
              </span>
              <button
                type="button"
                className={styles.pageBtn}
                aria-label="Next page"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over Assign Courier Drawer */}
      <AssignCourierDrawer
        isOpen={isAssignDrawerOpen}
        delivery={selectedForAssign}
        onClose={() => setIsAssignDrawerOpen(false)}
        onAssign={(deliveryId, courierId) => void handleAssignCourier(deliveryId, courierId)}
      />
    </div>
  )
}
