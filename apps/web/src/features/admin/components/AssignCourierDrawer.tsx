import React, { useState, useEffect } from 'react'
import { X, Search, Clock, Loader2 } from 'lucide-react'
import type { DeliveryItem } from '../types/admin-deliveries.types'
import { adminApi, type AdminCourierItem } from '../api/admin-api'
import { AdminFilterSelect } from './AdminFilterSelect'
import styles from './AssignCourierDrawer.module.css'

interface AvailableCourier {
  id: string
  name: string
  initials: string
  vehicleType: string
  zones: string
  activeCount: number
  isAvailable: boolean
  avatarColor: string
}

interface AssignCourierDrawerProps {
  readonly isOpen: boolean
  readonly delivery: DeliveryItem | null
  readonly onClose: () => void
  readonly onAssign: (deliveryId: string, courierId: string, note?: string) => void
}

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b']

export const AssignCourierDrawer: React.FC<AssignCourierDrawerProps> = ({
  isOpen,
  delivery,
  onClose,
  onAssign,
}) => {
  const [candidates, setCandidates] = useState<AvailableCourier[]>([])
  const [isLoadingCouriers, setIsLoadingCouriers] = useState(false)
  const [selectedCourierId, setSelectedCourierId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState<'available' | 'all'>('available')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    adminApi
      .getCouriers({ status: 'APPROVED' })
      .then((res) => {
        if (cancelled) return
        const mapped: AvailableCourier[] = (res.data || []).map((c: AdminCourierItem, index: number) => {
          const initials = c.fullName
            .split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()
          return {
            id: c.id,
            name: c.fullName,
            initials: initials || 'CR',
            vehicleType: c.courierProfile?.vehicleType || 'Courier',
            zones: c.courierProfile?.licensePlate || 'Registered',
            activeCount: c.activeDeliveriesCount,
            isAvailable: c.isActive,
            avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
          }
        })
        setCandidates(mapped)
        if (mapped.length > 0) {
          setSelectedCourierId(mapped[0].id)
        } else {
          setSelectedCourierId('')
        }
      })
      .catch((err) => {
        console.error('Failed to load couriers for drawer:', err)
        if (!cancelled) setCandidates([])
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCouriers(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !delivery) {
    return null
  }

  const filteredCandidates = candidates.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.vehicleType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.zones.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesAvailability = availabilityFilter === 'all' || c.isAvailable
    return matchesSearch && matchesAvailability
  })

  const selectedCandidate = candidates.find((c) => c.id === selectedCourierId)

  const handleConfirm = () => {
    if (selectedCourierId) {
      onAssign(delivery.id, selectedCourierId, note)
    }
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
        aria-labelledby="assign-courier-title"
      >
        {/* Drawer Header */}
        <div className={styles.drawerHeader}>
          <div>
            <h2 id="assign-courier-title" className={styles.title}>
              Assign courier
            </h2>
            <p className={styles.subtitle}>Choose a courier for this delivery.</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close drawer"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className={styles.drawerBody}>
          {/* Parcel Details Card */}
          <div className={styles.parcelCard}>
            <div className={styles.parcelHeader}>
              <div className={styles.trackingGroup}>
                <span className={styles.trackingBadge}>{delivery.trackingNo}</span>
                <span className={styles.failedPill}>{delivery.status}</span>
                <span className={styles.unassignedPill}>Unassigned</span>
              </div>
            </div>

            <div className={styles.parcelSpecs}>
              <span>
                {delivery.size} parcel • {delivery.weightKg} kg • {delivery.dimensions}
              </span>
            </div>

            <div className={styles.routeTimeline}>
              <div className={styles.routeStep}>
                <span className={styles.pickupDot} aria-hidden="true" />
                <div className={styles.stepContent}>
                  <span className={styles.stepLabel}>Pickup</span>
                  <span className={styles.stepAddress}>{delivery.pickupAddress}</span>
                </div>
              </div>

              <div className={styles.routeStep}>
                <span className={styles.dropoffDot} aria-hidden="true" />
                <div className={styles.stepContent}>
                  <span className={styles.stepLabel}>Drop-off</span>
                  <span className={styles.stepAddress}>{delivery.dropoffAddress}</span>
                </div>
              </div>
            </div>

            <div className={styles.waitAlert} role="note">
              <Clock size={16} aria-hidden="true" />
              <span>Waiting for reassignment: {delivery.waitingTime}</span>
            </div>
          </div>

          {/* Courier Selection Section */}
          <div className={styles.couriersSection}>
            <h3 className={styles.sectionHeading}>Choose courier</h3>

            <div className={styles.filterControls}>
              <div className={styles.searchInputWrapper}>
                <Search size={16} className={styles.searchIcon} aria-hidden="true" />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search courier name or ID"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search courier name or ID"
                />
              </div>

              <AdminFilterSelect
                value={availabilityFilter}
                onChange={(val) => setAvailabilityFilter(val as 'available' | 'all')}
                ariaLabel="Availability filter"
                options={[
                  { value: 'available', label: 'Available couriers' },
                  { value: 'all', label: 'All couriers' },
                ]}
              />
            </div>

            <span className={styles.resultsMeta}>
              {filteredCandidates.length} couriers available
            </span>

            <div className={styles.courierList} role="radiogroup" aria-label="Candidate couriers">
              {isLoadingCouriers ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', color: '#64748b', gap: '8px' }}>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Loading available couriers...</span>
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#64748b', fontSize: '14px' }}>
                  No approved couriers found in the database.
                </div>
              ) : (
                filteredCandidates.map((courier) => {
                const isSelected = courier.id === selectedCourierId
                return (
                  <div
                    key={courier.id}
                    className={`${styles.courierCard} ${
                      isSelected ? styles.courierCardSelected : ''
                    }`}
                    onClick={() => setSelectedCourierId(courier.id)}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        setSelectedCourierId(courier.id)
                      }
                    }}
                  >
                    <div className={styles.courierTopRow}>
                      <div className={styles.courierInfo}>
                        <div
                          className={styles.avatar}
                          style={{ backgroundColor: courier.avatarColor || '#10b981' }}
                        >
                          {courier.initials}
                        </div>
                        <div className={styles.courierMeta}>
                          <span className={styles.courierName}>{courier.name}</span>
                          <span className={styles.courierSub}>
                            {courier.vehicleType} • {courier.zones}
                          </span>
                        </div>
                      </div>

                      <span className={styles.availablePill}>Available</span>
                    </div>

                    <div className={styles.courierWorkloadRow}>
                      <span className={styles.workloadText}>
                        {courier.activeCount} active → {courier.activeCount + 1} after assignment
                      </span>
                      <span className={styles.limitsBadge}>
                        <span className={styles.limitsDot} aria-hidden="true" />
                        Parcel fits vehicle limits
                      </span>
                    </div>
                  </div>
                )
              }))}
            </div>

            <p className={styles.helperText}>
              Availability means accepting assignments, and does not mean zero active jobs.
            </p>

            <textarea
              className={styles.noteTextarea}
              placeholder="Add a note for the courier (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Add a note for the courier"
            />
          </div>
        </div>

        {/* Drawer Footer */}
        <div className={styles.drawerFooter}>
          <div className={styles.selectedSummary}>
            <span className={styles.selectedName}>
              Selected: {selectedCandidate ? selectedCandidate.name : 'None'}
            </span>
            <span className={styles.selectedSub}>The courier will be notified.</span>
          </div>

          <div className={styles.footerButtons}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.assignButton}
              onClick={handleConfirm}
              disabled={!selectedCourierId}
            >
              Assign courier
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
