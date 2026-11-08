import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Calendar,
  ChevronDown,
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  X,
  UserCheck,
} from 'lucide-react'
import type {
  CourierWorkload,
  UnassignedParcel,
} from '../types/admin-dashboard.types'
import {
  DEFAULT_DASHBOARD_METRICS,
  INITIAL_COURIERS,
  INITIAL_UNASSIGNED_PARCELS,
} from '../config/admin-dashboard.mock'
import styles from './AdminDashboardPage.module.css'

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const [parcels, setParcels] = useState<UnassignedParcel[]>(INITIAL_UNASSIGNED_PARCELS)
  const [couriers, setCouriers] = useState<CourierWorkload[]>(INITIAL_COURIERS)
  const [selectedParcel, setSelectedParcel] = useState<UnassignedParcel | null>(null)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [assignSuccessMessage, setAssignSuccessMessage] = useState<string | null>(null)

  const handleOpenAssign = (parcel: UnassignedParcel) => {
    setSelectedParcel(parcel)
    setIsAssignModalOpen(true)
  }

  const handleAssignToCourier = (courierId: string) => {
    if (!selectedParcel) return

    const courier = couriers.find((c) => c.id === courierId)
    if (!courier) return

    // Update courier workload immutably
    setCouriers((prev) =>
      prev.map((c) => (c.id === courierId ? { ...c, activeCount: c.activeCount + 1 } : c)),
    )

    // Remove assigned parcel from local unassigned feed
    setParcels((prev) => prev.filter((p) => p.id !== selectedParcel.id))

    setIsAssignModalOpen(false)
    setAssignSuccessMessage(`Parcel ${selectedParcel.trackingNo} assigned to ${courier.name}.`)
    setTimeout(() => setAssignSuccessMessage(null), 4000)
    setSelectedParcel(null)
  }

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p className={styles.pageSubtitle}>Assign parcels and keep deliveries moving.</p>
        </div>

        <button type="button" className={styles.dateBadge} aria-label="Select date filter">
          <Calendar size={16} aria-hidden="true" />
          <span>Today, 27 Oct 2026</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
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
              {DEFAULT_DASHBOARD_METRICS.unassignedParcelsCount}
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
              {DEFAULT_DASHBOARD_METRICS.activeDeliveriesCount}
            </span>
            <span className={styles.metricSubtext}>Across 12 couriers</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGreen}`}>
            <CheckCircle2 size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Delivered today</span>
            <span className={styles.metricValue}>
              {DEFAULT_DASHBOARD_METRICS.deliveredTodayCount}
            </span>
            <span className={styles.metricSubtext}>
              {DEFAULT_DASHBOARD_METRICS.completedAttemptsRate}% of completed attempts
            </span>
          </div>
        </div>
      </div>

      {/* Applications Awaiting Review Banner */}
      <div className={styles.alertBanner} role="alert">
        <div className={styles.alertLeft}>
          <span className={styles.alertIcon}>
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <span className={styles.alertText}>
            {DEFAULT_DASHBOARD_METRICS.pendingApplicationsCount} applications awaiting review
          </span>
        </div>
        <Link to="/admin/users" className={styles.alertLink}>
          Review applications
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

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
              Direct feed • Showing {parcels.length} of {DEFAULT_DASHBOARD_METRICS.unassignedParcelsCount}
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
              {parcels.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyTableRow}>
                    All current parcels have been assigned.
                  </td>
                </tr>
              ) : (
                parcels.map((parcel) => (
                  <tr key={parcel.id}>
                    <td>
                      <span className={styles.trackingNo}>{parcel.trackingNo}</span>
                    </td>
                    <td>
                      <span className={styles.routeText}>
                        {parcel.pickup}
                        <span className={styles.routeArrow} aria-hidden="true">→</span>
                        {parcel.dropoff}
                      </span>
                    </td>
                    <td>
                      <span className={styles.parcelDetails}>
                        {parcel.weight} • {parcel.size}
                      </span>
                    </td>
                    <td>
                      {parcel.status === 'Failed attempt' ? (
                        <span className={styles.badgeFailed}>Failed attempt</span>
                      ) : (
                        <span className={styles.badgeNew}>New delivery</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.waitingTime}>{parcel.waitingTime}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.assignButton}
                        onClick={() => handleOpenAssign(parcel)}
                        aria-label={`Assign courier to parcel ${parcel.trackingNo}`}
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

        <p className={styles.feedFooterNote}>
          Waiting — time since entering the unassigned queue
        </p>
      </div>

      {/* Bottom Grid: Courier Workloads & Today's Results */}
      <div className={styles.bottomGrid}>
        {/* Courier Workloads */}
        <div className={styles.dashboardCard}>
          <div className={styles.cardTopHeader}>
            <div>
              <h2 className={styles.cardHeading}>Courier workloads</h2>
              <p className={styles.cardSubheading}>Active deliveries per courier</p>
            </div>
            <Link to="/admin/couriers" className={styles.cardHeaderLink}>
              View couriers
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <div className={styles.courierList}>
            {couriers.map((courier) => {
              const fillPercentage = Math.min(
                100,
                Math.round((courier.activeCount / courier.capacity) * 100),
              )

              return (
                <div key={courier.id} className={styles.courierRow}>
                  <div className={styles.courierInfo}>
                    <div className={styles.courierAvatar}>{courier.initials}</div>
                    <div>
                      <h3 className={styles.courierName}>{courier.name}</h3>
                      <p className={styles.courierZone}>{courier.zone}</p>
                    </div>
                  </div>

                  <div className={styles.courierBarArea}>
                    <span className={styles.activeCountText}>{courier.activeCount} active</span>
                    <div
                      className={styles.progressBarTrack}
                      role="progressbar"
                      aria-valuenow={courier.activeCount}
                      aria-valuemin={0}
                      aria-valuemax={courier.capacity}
                      aria-label={`${courier.name} workload`}
                    >
                      <div
                        className={styles.progressBarFill}
                        style={{ width: `${fillPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Today's Results */}
        <div className={styles.dashboardCard}>
          <div className={styles.cardTopHeader}>
            <div>
              <h2 className={styles.cardHeading}>Today's results</h2>
            </div>
            <Link to="/admin/reports" className={styles.cardHeaderLink}>
              View reports
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {/* Stacked Progress Bar */}
          <div className={styles.resultsProgressContainer}>
            <div className={styles.stackedProgressBar}>
              <div
                className={styles.progressDelivered}
                style={{ width: `${DEFAULT_DASHBOARD_METRICS.successRate}%` }}
              >
                {DEFAULT_DASHBOARD_METRICS.successRate}%
              </div>
              <div
                className={styles.progressFailed}
                style={{ width: `${100 - DEFAULT_DASHBOARD_METRICS.successRate}%` }}
              />
            </div>
          </div>

          {/* Big Stat & Legend */}
          <div className={styles.successRateRow}>
            <div className={styles.successStatArea}>
              <h3 className={styles.bigSuccessNumber}>
                {DEFAULT_DASHBOARD_METRICS.successRate}%
              </h3>
              <span className={styles.successStatLabel}>Success rate</span>
            </div>

            <div className={styles.legendArea}>
              <div className={styles.legendItem}>
                <span className={styles.legendDotDelivered} aria-hidden="true" />
                <span>Delivered</span>
                <span className={styles.legendCount}>
                  {DEFAULT_DASHBOARD_METRICS.deliveredCount}
                </span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDotFailed} aria-hidden="true" />
                <span>Failed attempts</span>
                <span className={styles.legendCount}>
                  {DEFAULT_DASHBOARD_METRICS.failedAttemptsCount}
                </span>
              </div>
            </div>
          </div>

          {/* Results Footer Note & Action */}
          <div className={styles.resultsFooter}>
            <p className={styles.attemptsNote}>
              {DEFAULT_DASHBOARD_METRICS.deliveredCount} delivered out of{' '}
              {DEFAULT_DASHBOARD_METRICS.totalCompletedAttempts} completed attempts
            </p>
            <Link to="/admin/deliveries?status=failed" className={styles.reviewFailedLink}>
              Review failed deliveries
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {/* Assign Courier Drawer / Modal */}
      {isAssignModalOpen && selectedParcel && (
        <div
          className={styles.modalOverlay}
          onClick={() => setIsAssignModalOpen(false)}
          role="presentation"
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-modal-title"
          >
            <div className={styles.modalHeader}>
              <h3 id="assign-modal-title" className={styles.modalTitle}>
                Assign Courier
              </h3>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={() => setIsAssignModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalParcelPreview}>
                <strong>{selectedParcel.trackingNo}</strong> &bull; {selectedParcel.pickup} →{' '}
                {selectedParcel.dropoff} ({selectedParcel.weight}, {selectedParcel.size})
              </div>

              <p className={styles.modalCourierTitle}>Select an active courier:</p>

              <div>
                {couriers.map((courier) => (
                  <button
                    key={courier.id}
                    type="button"
                    className={styles.modalCourierOption}
                    onClick={() => handleAssignToCourier(courier.id)}
                  >
                    <div className={styles.modalCourierLeft}>
                      <div className={styles.courierAvatar}>{courier.initials}</div>
                      <div>
                        <div className={styles.modalCourierName}>{courier.name}</div>
                        <div className={styles.modalCourierSub}>{courier.zone}</div>
                      </div>
                    </div>
                    <span className={styles.modalCourierAction}>
                      {courier.activeCount} active &rarr;
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setIsAssignModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboardPage
