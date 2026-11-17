import React, { useState, useMemo } from 'react'
import {
  Package,
  Truck,
  CheckCircle2,
  Search,
  Home,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import type { DeliveryItem, DeliveryStatus } from '../types/admin-deliveries.types'
import { MOCK_DELIVERIES } from '../config/admin-deliveries.mock'
import { AssignCourierDrawer } from '../components/AssignCourierDrawer'
import styles from './AdminDeliveriesPage.module.css'

type FilterTab = 'all' | 'unassigned' | 'in_progress' | 'delivered' | 'failed'

export const AdminDeliveriesPage: React.FC = () => {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>(() => [...MOCK_DELIVERIES])
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [zoneFilter, setZoneFilter] = useState<string>('all')
  const [selectedForAssign, setSelectedForAssign] = useState<DeliveryItem | null>(null)
  const [isAssignDrawerOpen, setIsAssignDrawerOpen] = useState(false)

  // Counts for metric cards & tabs
  const unassignedCount = useMemo(
    () => deliveries.filter((d) => !d.courierName).length,
    [deliveries],
  )
  const activeCount = useMemo(
    () => deliveries.filter((d) => d.status === 'In transit' || d.status === 'Out for delivery').length,
    [deliveries],
  )
  const deliveredCount = useMemo(
    () => deliveries.filter((d) => d.status === 'Delivered').length,
    [deliveries],
  )

  // Filtered deliveries list based on tabs, search, and dropdowns
  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((item) => {
      // Tab filter
      if (activeTab === 'unassigned' && item.courierName) return false
      if (activeTab === 'in_progress' && item.status !== 'In transit' && item.status !== 'Out for delivery') return false
      if (activeTab === 'delivered' && item.status !== 'Delivered') return false
      if (activeTab === 'failed' && item.status !== 'Failed attempt') return false

      // Status dropdown filter
      if (statusFilter !== 'all' && item.status !== statusFilter) return false

      // Zone dropdown filter
      if (zoneFilter !== 'all' && !item.zone.toLowerCase().includes(zoneFilter.toLowerCase())) return false

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesTracking = item.trackingNo.toLowerCase().includes(query)
        const matchesRecipient = item.recipient.toLowerCase().includes(query)
        const matchesCourier = item.courierName?.toLowerCase().includes(query) ?? false
        if (!matchesTracking && !matchesRecipient && !matchesCourier) return false
      }

      return true
    })
  }, [deliveries, activeTab, statusFilter, zoneFilter, searchQuery])

  const handleOpenAssign = (item: DeliveryItem) => {
    setSelectedForAssign(item)
    setIsAssignDrawerOpen(true)
  }

  const handleAssignCourier = (deliveryId: string, courierId: string) => {
    const courierNames: Record<string, string> = {
      'c-1': 'Nuwan Silva',
      'c-2': 'Kasun Perera',
      'c-3': 'Sahan Perera',
    }
    const assignedName = courierNames[courierId] || 'Assigned Courier'

    setDeliveries((prev) =>
      prev.map((d) =>
        d.id === deliveryId
          ? {
              ...d,
              courierName: assignedName,
              courierId,
              status: 'In transit',
              waitingTime: '—',
            }
          : d,
      ),
    )
    setIsAssignDrawerOpen(false)
    setSelectedForAssign(null)
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

      {/* 3 Metric KPI Cards */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconOrange}`}>
            <Package size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Unassigned</span>
            <span className={styles.metricValue}>18</span>
            <span className={styles.metricSubtext}>Waiting for a courier</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGreen}`}>
            <Truck size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Active deliveries</span>
            <span className={styles.metricValue}>64</span>
            <span className={styles.metricSubtext}>Assigned and in progress</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGreen}`}>
            <CheckCircle2 size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Delivered today</span>
            <span className={styles.metricValue}>46</span>
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
            Unassigned ({unassignedCount})
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
            In progress ({activeCount})
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
            Delivered ({deliveredCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'failed'}
            className={`${styles.tabButton} ${activeTab === 'failed' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('failed')}
          >
            Failed attempts
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
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search tracking or recipient"
            />
          </div>

          <div className={styles.dropdownGroup}>
            <select
              className={styles.filterSelect}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="Failed attempt">Failed attempt</option>
              <option value="New delivery">New delivery</option>
              <option value="Out for delivery">Out for delivery</option>
              <option value="In transit">In transit</option>
              <option value="Delivered">Delivered</option>
            </select>

            <select
              className={styles.filterSelect}
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              aria-label="Filter by zone"
            >
              <option value="all">All zones</option>
              <option value="Colombo">Colombo Central & South</option>
              <option value="Nugegoda">Nugegoda</option>
              <option value="Rajagiriya">Rajagiriya</option>
              <option value="Dehiwala">Dehiwala / Mount Lavinia</option>
            </select>

            <select className={styles.filterSelect} aria-label="Filter by creation date">
              <option value="any">Created: Any date</option>
              <option value="today">Created: Today</option>
              <option value="yesterday">Created: Yesterday</option>
              <option value="week">Created: Past 7 days</option>
            </select>
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
              {filteredDeliveries.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    No deliveries match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredDeliveries.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className={styles.trackingCell}>
                        <span className={styles.trackingNo}>{item.trackingNo}</span>
                        <span className={styles.recipientText}>{item.recipient}</span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.routeText}>
                        {item.pickup}
                        <span className={styles.routeArrow} aria-hidden="true">→</span>
                        {item.dropoff}
                      </span>
                    </td>
                    <td>
                      <span className={styles.parcelSpecs}>
                        {item.weightKg} kg • {item.size}
                      </span>
                    </td>
                    <td>{renderStatusBadge(item.status)}</td>
                    <td>
                      {item.courierName ? (
                        <span className={styles.courierText}>{item.courierName}</span>
                      ) : (
                        <span className={styles.unassignedText}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.waitingTime}>{item.waitingTime}</span>
                    </td>
                    <td>
                      {!item.courierName ? (
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
                          View details →
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className={styles.tableFooter}>
          <p className={styles.footerNote}>* Waiting: Time in the unassigned queue.</p>

          <div className={styles.paginationControls}>
            <span className={styles.paginationText}>Showing 1-7 of 328 deliveries</span>
            <select className={styles.pageSelect} aria-label="Rows per page" defaultValue="7">
              <option value="7">7 per page</option>
              <option value="15">15 per page</option>
              <option value="25">25 per page</option>
            </select>

            <div className={styles.pagesList}>
              <button type="button" className={styles.pageBtn} aria-label="Previous page">
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button type="button" className={`${styles.pageBtn} ${styles.pageBtnActive}`}>
                1
              </button>
              <button type="button" className={styles.pageBtn}>
                2
              </button>
              <button type="button" className={styles.pageBtn}>
                3
              </button>
              <span style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>
              <button type="button" className={styles.pageBtn}>
                47
              </button>
              <button type="button" className={styles.pageBtn} aria-label="Next page">
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
        onAssign={handleAssignCourier}
      />
    </div>
  )
}

