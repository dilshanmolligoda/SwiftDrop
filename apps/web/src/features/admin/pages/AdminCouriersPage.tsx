import React, { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  UserCheck,
  Truck,
  Search,
  Home,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
} from 'lucide-react'
import type { CourierDetailItem } from '../types/admin-couriers.types'
import { MOCK_COURIER_DETAILS } from '../config/admin-couriers.mock'
import { CourierDetailsDrawer } from '../components/CourierDetailsDrawer'
import styles from './AdminCouriersPage.module.css'

export const AdminCouriersPage: React.FC = () => {
  const navigate = useNavigate()
  const [couriers] = useState<readonly CourierDetailItem[]>(MOCK_COURIER_DETAILS)
  const [searchQuery, setSearchQuery] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [vehicleFilter, setVehicleFilter] = useState('all')
  const [selectedCourier, setSelectedCourier] = useState<CourierDetailItem | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const filteredCouriers = useMemo(() => {
    return couriers.filter((c) => {
      // Availability filter
      if (availabilityFilter === 'available' && !c.isAvailable) return false
      if (availabilityFilter === 'unavailable' && c.isAvailable) return false

      // Zone filter
      if (zoneFilter !== 'all' && !c.serviceZones.some((z) => z.toLowerCase().includes(zoneFilter.toLowerCase()))) {
        return false
      }

      // Vehicle filter
      if (vehicleFilter !== 'all' && !c.vehicleType.toLowerCase().includes(vehicleFilter.toLowerCase())) {
        return false
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesName = c.name.toLowerCase().includes(query)
        const matchesCode = c.courierCode.toLowerCase().includes(query)
        const matchesPhone = c.phone.toLowerCase().includes(query)
        if (!matchesName && !matchesCode && !matchesPhone) return false
      }

      return true
    })
  }, [couriers, availabilityFilter, zoneFilter, vehicleFilter, searchQuery])

  const handleOpenDetails = (courier: CourierDetailItem) => {
    setSelectedCourier(courier)
    setIsDrawerOpen(true)
  }

  // Pre-assigned avatar background colors
  const avatarColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b']

  return (
    <div className={styles.pageContainer}>
      {/* Header and Breadcrumb */}
      <div className={styles.pageHeader}>
        <div className={styles.breadcrumb} aria-label="Breadcrumb">
          <Home size={14} aria-hidden="true" />
          <ChevronRight size={12} aria-hidden="true" />
          <span className={styles.breadcrumbCurrent}>Couriers</span>
        </div>
        <h1 className={styles.pageTitle}>Couriers</h1>
        <p className={styles.pageSubtitle}>Check availability and balance delivery workloads.</p>
      </div>

      {/* 3 Metric Cards */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricIconWrapper}>
            <ShieldCheck size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Approved couriers</span>
            <span className={styles.metricValue}>16</span>
            <span className={styles.metricSubtext}>Ready for dispatch management</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIconWrapper}>
            <UserCheck size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Available now</span>
            <span className={styles.metricValue}>12</span>
            <span className={styles.metricSubtext}>Accepting new assignments</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIconWrapper}>
            <Truck size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Active deliveries</span>
            <span className={styles.metricValue}>64</span>
            <span className={styles.metricSubtext}>Across 12 couriers</span>
          </div>
        </div>
      </div>

      {/* Directory Box */}
      <div className={styles.contentCard}>
        <div className={styles.cardHeaderRow}>
          <h2 className={styles.cardTitle}>Courier directory</h2>
          <Link to="/admin/users" className={styles.reviewLink}>
            Review applications (4)
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        {/* Filter Controls */}
        <div className={styles.filterBar}>
          <div className={styles.searchInputWrapper}>
            <Search size={16} className={styles.searchIcon} aria-hidden="true" />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search name, ID or phone"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search name, ID or phone"
            />
          </div>

          <div className={styles.dropdownGroup}>
            <select
              className={styles.filterSelect}
              value={availabilityFilter}
              onChange={(e) =>
                setAvailabilityFilter(e.target.value as 'all' | 'available' | 'unavailable')
              }
              aria-label="Filter availability"
            >
              <option value="all">All availability</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>

            <select
              className={styles.filterSelect}
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              aria-label="Filter zones"
            >
              <option value="all">All zones</option>
              <option value="Colombo">Colombo Central & South</option>
              <option value="Nugegoda">Nugegoda</option>
              <option value="Rajagiriya">Rajagiriya</option>
              <option value="Dehiwala">Dehiwala / Mount Lavinia</option>
            </select>

            <select
              className={styles.filterSelect}
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              aria-label="Filter vehicles"
            >
              <option value="all">All vehicles</option>
              <option value="Motorbike">Motorbike</option>
              <option value="Three-wheeler">Three-wheeler</option>
              <option value="Van">Van</option>
            </select>
          </div>
        </div>

        {/* Couriers Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.couriersTable}>
            <thead>
              <tr>
                <th scope="col">Courier</th>
                <th scope="col">Service zones</th>
                <th scope="col">Vehicle</th>
                <th scope="col">Availability</th>
                <th scope="col">Active deliveries</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCouriers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    No couriers found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredCouriers.map((courier, idx) => (
                  <tr key={courier.id}>
                    <td>
                      <div className={styles.courierCell}>
                        <div
                          className={styles.avatarCircle}
                          style={{ backgroundColor: avatarColors[idx % avatarColors.length] }}
                        >
                          {courier.initials}
                        </div>
                        <div className={styles.courierMeta}>
                          <span className={styles.courierName}>{courier.name}</span>
                          <span className={styles.courierCode}>{courier.courierCode}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.zonesText}>
                        {courier.serviceZones.join(' / ')}
                      </span>
                    </td>
                    <td>
                      <div className={styles.vehicleCell}>
                        <span className={styles.vehicleType}>{courier.vehicleType}</span>
                        <span className={styles.vehicleSpecs}>
                          Max parcel load: {courier.maxParcelLoadKg} kg
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`${styles.availPill} ${
                          courier.isAvailable ? styles.availGreen : styles.availGray
                        }`}
                      >
                        {courier.isAvailable ? 'Available' : 'Unavailable'}
                      </span>
                    </td>
                    <td>
                      <div className={styles.workloadCell}>
                        <span className={styles.activeNumber}>{courier.activeDeliveriesCount} active</span>
                        {courier.activeDeliveriesCount > 0 && (
                          <button
                            type="button"
                            className={styles.viewDeliveriesLink}
                            onClick={() => navigate('/admin/deliveries')}
                          >
                            View deliveries
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.viewDetailsButton}
                        onClick={() => handleOpenDetails(courier)}
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer & Pagination */}
        <div className={styles.tableFooter}>
          <p className={styles.footerNote}>Availability shows who is accepting new assignments.</p>

          <div className={styles.paginationControls}>
            <span className={styles.paginationText}>Showing 1-6 of 16 couriers</span>
            <select className={styles.pageSelect} aria-label="Rows per page" defaultValue="7">
              <option value="7">7 per page</option>
              <option value="15">15 per page</option>
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
              <button type="button" className={styles.pageBtn} aria-label="Next page">
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over Courier Details Drawer */}
      <CourierDetailsDrawer
        isOpen={isDrawerOpen}
        courier={selectedCourier}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  )
}

