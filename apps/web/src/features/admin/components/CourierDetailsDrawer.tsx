import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X,
  Phone,
  Mail,
  CheckCircle2,
  Edit2,
} from 'lucide-react'
import type { CourierDetailItem } from '../types/admin-couriers.types'
import styles from './CourierDetailsDrawer.module.css'

interface CourierDetailsDrawerProps {
  readonly isOpen: boolean
  readonly courier: CourierDetailItem | null
  readonly onClose: () => void
}

export const CourierDetailsDrawer: React.FC<CourierDetailsDrawerProps> = ({
  isOpen,
  courier,
  onClose,
}) => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !courier) {
    return null
  }

  const handleNavigateToDeliveries = () => {
    onClose()
    navigate('/admin/deliveries')
  }

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles.drawer}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="courier-details-title"
      >
        {/* Drawer Header */}
        <div className={styles.drawerHeader}>
          <h2 id="courier-details-title" className={styles.title}>
            Courier details
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close details drawer"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className={styles.drawerBody}>
          {/* Profile Overview */}
          <div className={styles.profileCard}>
            <div className={styles.profileTop}>
              <div className={styles.avatar}>{courier.initials}</div>
              <div className={styles.profileInfo}>
                <div className={styles.nameRow}>
                  <span className={styles.courierName}>{courier.name}</span>
                  <span className={styles.codeBadge}>{courier.courierCode}</span>
                </div>
                <div className={styles.badgesRow}>
                  <span className={styles.approvedBadge}>Approved</span>
                  {courier.isAvailable ? (
                    <span className={styles.availableBadge}>Available</span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Unavailable</span>
                  )}
                </div>
                <span className={styles.subtext}>
                  {courier.isAvailable ? 'Accepting new assignments' : 'Currently off duty'}
                </span>
              </div>
            </div>

            <div className={styles.contactRow}>
              <div className={styles.contactItem}>
                <div className={styles.contactLabelGroup}>
                  <Phone size={14} color="#64748b" aria-hidden="true" />
                  <span>{courier.phone}</span>
                </div>
                <button
                  type="button"
                  className={styles.callButton}
                  onClick={() => alert(`Calling ${courier.name} at ${courier.phone}...`)}
                >
                  <Phone size={12} aria-hidden="true" />
                  Call
                </button>
              </div>

              <div className={styles.contactItem}>
                <div className={styles.contactLabelGroup}>
                  <Mail size={14} color="#64748b" aria-hidden="true" />
                  <span>{courier.email}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Service Zones */}
          <div className={styles.sectionBlock}>
            <div className={styles.sectionHeaderRow}>
              <h3 className={styles.sectionTitle}>Service zones</h3>
              <button
                type="button"
                className={styles.actionLink}
                onClick={() => alert('Zone assignment management will open here.')}
              >
                <Edit2 size={12} aria-hidden="true" />
                Edit zones
              </button>
            </div>
            <div className={styles.zonesList}>
              {courier.serviceZones.map((zone) => (
                <span key={zone} className={styles.zoneTag}>
                  {zone}
                </span>
              ))}
            </div>
          </div>

          {/* Vehicle & Capacity */}
          <div className={styles.sectionBlock}>
            <h3 className={styles.sectionTitle}>Vehicle & capacity</h3>
            <div className={styles.specsGrid}>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Vehicle</span>
                <span className={styles.specValue}>{courier.vehicleType}</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Ownership</span>
                <span className={styles.specValue}>{courier.vehicleOwnership}</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Registration</span>
                <span className={styles.specValue}>{courier.vehicleRegistration}</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Max parcel load</span>
                <span className={styles.specValue}>{courier.maxParcelLoadKg} kg</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Cargo space</span>
                <span className={styles.specValue}>{courier.cargoSpaceDimensions}</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Covered storage</span>
                <span className={styles.specValue}>{courier.coveredStorage ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Verification Documents */}
          <div className={styles.sectionBlock}>
            <h3 className={styles.sectionTitle}>Verification documents</h3>
            <div className={styles.verifiedBadgeBox}>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{courier.verifiedDocumentsCount} verified</span>
            </div>
          </div>

          {/* Active Deliveries */}
          <div className={styles.sectionBlock}>
            <div className={styles.sectionHeaderRow}>
              <h3 className={styles.sectionTitle}>
                Active deliveries ({courier.activeDeliveriesCount})
              </h3>
              <button
                type="button"
                className={styles.actionLink}
                onClick={handleNavigateToDeliveries}
              >
                View all {courier.activeDeliveriesCount} →
              </button>
            </div>

            <div className={styles.deliveriesList}>
              {courier.activeDeliveriesList.length === 0 ? (
                <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
                  No active deliveries at the moment.
                </span>
              ) : (
                courier.activeDeliveriesList.map((del) => (
                  <div key={del.id} className={styles.deliveryCard}>
                    <div className={styles.deliveryDetails}>
                      <span className={styles.deliveryDot} aria-hidden="true" />
                      <span className={styles.deliveryCode}>{del.trackingNo}</span>
                      <span className={styles.deliveryDest}>• {del.destination}</span>
                    </div>
                    <span
                      className={`${styles.statusPill} ${
                        del.status === 'Out for delivery' ? styles.statusOut : styles.statusTransit
                      }`}
                    >
                      {del.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className={styles.drawerFooter}>
          <button type="button" className={styles.closeFooterBtn} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={styles.primaryFooterBtn}
            onClick={handleNavigateToDeliveries}
          >
            View all deliveries
          </button>
        </div>
      </div>
    </div>
  )
}
