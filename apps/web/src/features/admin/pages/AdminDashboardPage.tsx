import React, { useEffect, useMemo, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Calendar,
  ChevronDown,
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  UserCheck,
} from 'lucide-react'
import type { DeliveryItem, DeliveryStatus } from '../types/admin-deliveries.types'
import { AssignCourierDrawer } from '../components/AssignCourierDrawer'
import { adminApi, type AdminDashboardKpis, type AdminUnassignedParcel } from '../api/admin-api'
import styles from './AdminDashboardPage.module.css'

function calculateWaitingTime(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  if (diffMinutes < 60) return `${Math.max(1, diffMinutes)}m`
  const diffHours = Math.floor(diffMinutes / 60)
  return `${diffHours}h ${diffMinutes % 60}m`
}

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState<AdminDashboardKpis | null>(null)
  const [parcels, setParcels] = useState<AdminUnassignedParcel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedParcel, setSelectedParcel] = useState<AdminUnassignedParcel | null>(null)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [assignSuccessMessage, setAssignSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Fetch live dashboard KPIs and unassigned parcels from the API
  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()

    const loadDashboardData = async () => {
      try {
        setIsLoading(true)
        setErrorMessage(null)

        const [dashboardRes, unassignedRes] = await Promise.all([
          adminApi.getDashboard(controller.signal),
          adminApi.getUnassignedParcels(controller.signal),
        ])

        if (!isMounted) return
        setMetrics(dashboardRes.kpis)
        setParcels(unassignedRes)
      } catch (err: unknown) {
        if (!isMounted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to load dashboard data from server.',
        )
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadDashboardData()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [])

  const handleOpenAssign = (parcel: AdminUnassignedParcel) => {
    setSelectedParcel(parcel)
    setIsAssignModalOpen(true)
  }

  const handleAssignToCourier = async (deliveryId: string, courierId: string) => {
    try {
      const res = await adminApi.assignCourier(deliveryId, courierId)

      // Remove assigned parcel from local state immediately
      setParcels((prev) => prev.filter((p) => p.id !== deliveryId))

      // Update KPI counts in local state
      setMetrics((prev) =>
        prev
          ? {
              ...prev,
              pendingDispatch: Math.max(0, prev.pendingDispatch - 1),
              activeInTransit: prev.activeInTransit + 1,
            }
          : prev,
      )

      setIsAssignModalOpen(false)
      setSelectedParcel(null)
      setAssignSuccessMessage(
        `Parcel assigned successfully to ${res.courierName}.`,
      )
      setTimeout(() => setAssignSuccessMessage(null), 4000)
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to assign courier. Please try again.',
      )
    }
  }

  const selectedDeliveryItem = useMemo<DeliveryItem | null>(() => {
    if (!selectedParcel) return null
    return {
      id: selectedParcel.id,
      trackingNo: selectedParcel.trackingNumber,
      recipient: selectedParcel.recipientName,
      pickup: selectedParcel.senderAddress.split(',')[0]?.trim() || 'Pickup Depot',
      dropoff: selectedParcel.recipientAddress.split(',')[0]?.trim() || 'Destination',
      pickupAddress: selectedParcel.senderAddress,
      dropoffAddress: selectedParcel.recipientAddress,
      weightKg: typeof selectedParcel.weightKg === 'number' ? selectedParcel.weightKg : parseFloat(String(selectedParcel.weightKg)) || 1.0,
      size: (selectedParcel.packageSize as 'Small' | 'Medium' | 'Large') || 'Medium',
      dimensions: 'Standard package',
      status: (selectedParcel.status as DeliveryStatus) || 'Pending dispatch',
      courierName: null,
      courierId: null,
      waitingTime: calculateWaitingTime(selectedParcel.createdAt),
      zone: 'Western Province',
      createdAt: selectedParcel.createdAt,
    }
  }, [selectedParcel])

  const [todayLabel] = useState(() =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date()),
  )

  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false)
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'past7' | 'past30'>('today')
  const dateMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dateMenuRef.current && !dateMenuRef.current.contains(e.target as Node)) {
        setIsDateMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentDateLabel = useMemo(() => {
    switch (dateFilter) {
      case 'today':
        return `Today, ${todayLabel}`
      case 'yesterday':
        return 'Yesterday'
      case 'past7':
        return 'Past 7 days'
      case 'past30':
        return 'Past 30 days'
      default:
        return `Today, ${todayLabel}`
    }
  }, [dateFilter, todayLabel])

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p className={styles.pageSubtitle}>Assign parcels and keep deliveries moving.</p>
        </div>

        <div className={styles.dateDropdownWrapper} ref={dateMenuRef}>
          <button
            type="button"
            className={styles.dateBadge}
            aria-label="Select date filter"
            aria-expanded={isDateMenuOpen}
            onClick={() => setIsDateMenuOpen((prev) => !prev)}
          >
            <Calendar size={16} aria-hidden="true" />
            <span>{currentDateLabel}</span>
            <ChevronDown
              size={14}
              className={`${styles.chevron} ${isDateMenuOpen ? styles.chevronRotated : ''}`}
              aria-hidden="true"
            />
          </button>

          {isDateMenuOpen && (
            <div className={styles.dateDropdownMenu} role="menu">
              <button
                type="button"
                role="menuitem"
                className={`${styles.dateOptionItem} ${dateFilter === 'today' ? styles.dateOptionSelected : ''}`}
                onClick={() => {
                  setDateFilter('today')
                  setIsDateMenuOpen(false)
                }}
              >
                <span>Today ({todayLabel})</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={`${styles.dateOptionItem} ${dateFilter === 'yesterday' ? styles.dateOptionSelected : ''}`}
                onClick={() => {
                  setDateFilter('yesterday')
                  setIsDateMenuOpen(false)
                }}
              >
                <span>Yesterday</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={`${styles.dateOptionItem} ${dateFilter === 'past7' ? styles.dateOptionSelected : ''}`}
                onClick={() => {
                  setDateFilter('past7')
                  setIsDateMenuOpen(false)
                }}
              >
                <span>Past 7 days</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={`${styles.dateOptionItem} ${dateFilter === 'past30' ? styles.dateOptionSelected : ''}`}
                onClick={() => {
                  setDateFilter('past30')
                  setIsDateMenuOpen(false)
                }}
              >
                <span>Past 30 days</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconOrange}`}>
            <Package size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Unassigned parcels</span>
            <span className={styles.metricValue}>
              {metrics ? metrics.pendingDispatch : 0}
            </span>
            <span className={styles.metricSubtext}>Waiting for a courier</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGreen}`}>
            <Truck size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Active deliveries</span>
            <span className={styles.metricValue}>
              {metrics ? metrics.activeInTransit : 0}
            </span>
            <span className={styles.metricSubtext}>
              Across {metrics ? metrics.activeCouriersCount : 0} couriers
            </span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGreen}`}>
            <CheckCircle2 size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Delivered today</span>
            <span className={styles.metricValue}>
              {metrics ? metrics.deliveredToday : 0}
            </span>
            <span className={styles.metricSubtext}>
              {metrics && (metrics.deliveredToday + metrics.failedAttempts) > 0
                ? Math.round((metrics.deliveredToday / (metrics.deliveredToday + metrics.failedAttempts)) * 100)
                : 100}% success rate
            </span>
          </div>
        </div>
      </div>

      {/* Applications Awaiting Review Banner */}
      {(metrics?.pendingApprovalsCount ?? 0) > 0 && (
        <div className={styles.alertBanner} role="alert">
          <div className={styles.alertLeft}>
            <span className={styles.alertIcon}>
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <span className={styles.alertText}>
              {metrics?.pendingApprovalsCount} applications awaiting review
            </span>
          </div>
          <Link to="/admin/users" className={styles.alertLink}>
            Review applications
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Error notification banner */}
      {errorMessage && (
        <div className={`${styles.alertBanner} ${styles.errorBanner}`} role="alert">
          <div className={styles.alertLeft}>
            <span className={`${styles.alertIcon} ${styles.errorIcon}`}>
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <span className={styles.alertText}>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Feedback banner if an assignment was made */}
      {assignSuccessMessage && (
        <div className={`${styles.alertBanner} ${styles.successBanner}`} role="status">
          <div className={styles.alertLeft}>
            <span className={`${styles.alertIcon} ${styles.successIcon}`}>
              <UserCheck size={18} aria-hidden="true" />
            </span>
            <span className={`${styles.alertText} ${styles.successText}`}>
              {assignSuccessMessage}
            </span>
          </div>
        </div>
      )}

      {/* Unassigned Parcels Feed Section */}
      <div className={styles.feedCard}>
        <div className={styles.feedCardHeader}>
          <div>
            <h2 className={styles.feedTitle}>Unassigned parcels</h2>
            <p className={styles.feedSubtitle}>
              Direct feed • Showing {parcels.length} unassigned
            </p>
          </div>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => navigate('/admin/deliveries')}
          >
            View all & assign
          </button>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.parcelsTable}>
            <thead>
              <tr>
                <th scope="col">Tracking No.</th>
                <th scope="col">Pickup → Drop-off</th>
                <th scope="col">Parcel</th>
                <th scope="col">Status</th>
                <th scope="col">Waiting</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className={styles.emptyTableRow}>
                    Loading unassigned parcels...
                  </td>
                </tr>
              ) : parcels.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyTableRow}>
                    No unassigned parcels at the moment. All parcels have been dispatched.
                  </td>
                </tr>
              ) : (
                parcels.map((parcel) => (
                  <tr key={parcel.id}>
                    <td>
                      <span className={styles.trackingNo}>{parcel.trackingNumber}</span>
                    </td>
                    <td>
                      <span className={styles.routeText}>
                        {parcel.senderAddress.split(',')[0]}
                        <span className={styles.routeArrow} aria-hidden="true">→</span>
                        {parcel.recipientAddress.split(',')[0]}
                      </span>
                    </td>
                    <td>
                      <span className={styles.parcelDetails}>
                        {parcel.weightKg} kg • {parcel.packageSize}
                      </span>
                    </td>
                    <td>
                      <span className={styles.badgeNew}>{parcel.status}</span>
                    </td>
                    <td>
                      <span className={styles.waitingTime}>
                        {calculateWaitingTime(parcel.createdAt)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.assignButton}
                        onClick={() => handleOpenAssign(parcel)}
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Courier Slide-over Drawer */}
      <AssignCourierDrawer
        isOpen={isAssignModalOpen}
        delivery={selectedDeliveryItem}
        onClose={() => {
          setIsAssignModalOpen(false)
          setSelectedParcel(null)
        }}
        onAssign={(deliveryId, courierId) => void handleAssignToCourier(deliveryId, courierId)}
      />
    </div>
  )
}
export default AdminDashboardPage
