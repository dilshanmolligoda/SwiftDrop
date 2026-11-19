import React, { useState, useMemo, useEffect } from 'react'
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
  Loader2,
  AlertCircle,
} from 'lucide-react'
import type { CourierDetailItem } from '../types/admin-couriers.types'
import { CourierDetailsDrawer } from '../components/CourierDetailsDrawer'
import { adminApi, type AdminCourierItem, type AdminDashboardKpis } from '../api/admin-api'
import styles from './AdminCouriersPage.module.css'

function mapAdminCourierToDetail(c: AdminCourierItem): CourierDetailItem {
  const initials = c.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const vehicle = c.courierProfile?.vehicleType || 'Vehicle'
  let maxKg = 25
  if (vehicle.toLowerCase().includes('van')) maxKg = 200
  else if (vehicle.toLowerCase().includes('three-wheeler') || vehicle.toLowerCase().includes('tuk')) maxKg = 60

  return {
    id: c.id,
    courierCode: `CR-${c.id.slice(0, 6).toUpperCase()}`,
    name: c.fullName,
    initials: initials || 'CR',
    phone: c.phoneNumber || 'Not provided',
    email: c.email,
    serviceZones: c.courierProfile?.licensePlate ? [c.courierProfile.licensePlate] : ['All zones'],
    vehicleType: vehicle,
    vehicleOwnership: 'Registered',
    vehicleRegistration: c.courierProfile?.licensePlate || 'Pending registration',
    maxParcelLoadKg: maxKg,
    cargoSpaceDimensions: 'Standard cargo',
    coveredStorage: true,
    isApproved: c.approvalStatus === 'APPROVED',
    isAvailable: c.isActive,
    activeDeliveriesCount: c.activeDeliveriesCount,
    verifiedDocumentsCount: c.courierProfile?.licenseNumber ? 2 : 1,
    activeDeliveriesList: [],
  }
}

export const AdminCouriersPage: React.FC = () => {
  const navigate = useNavigate()
  const [couriers, setCouriers] = useState<CourierDetailItem[]>([])
  const [kpis, setKpis] = useState<AdminDashboardKpis | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all')
  const [vehicleFilter, setVehicleFilter] = useState('all')
  const [selectedCourier, setSelectedCourier] = useState<CourierDetailItem | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()

    async function fetchCouriers() {
      try {
        const [couriersRes, dashboardRes] = await Promise.all([
          adminApi.getCouriers({
            page,
            limit,
            search: searchQuery.trim() || undefined,
          }),
          adminApi.getDashboard(controller.signal),
        ])
        if (!isMounted) return
        const mapped = (couriersRes.data || []).map(mapAdminCourierToDetail)
        setCouriers(mapped)
        setTotalPages(couriersRes.pagination?.totalPages || 1)
        setTotalCount(couriersRes.pagination?.total || 0)
        setKpis(dashboardRes.kpis)
      } catch (err: unknown) {
        if (!isMounted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('Failed to load couriers:', err)
        setError('Could not load couriers from backend.')
        setCouriers([])
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void fetchCouriers()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [page, limit, searchQuery])

  const filteredCouriers = useMemo(() => {
    return couriers.filter((c) => {
      // Availability filter
      if (availabilityFilter === 'available' && !c.isAvailable) return false
      if (availabilityFilter === 'unavailable' && c.isAvailable) return false

      // Vehicle filter
      if (vehicleFilter !== 'all' && !c.vehicleType.toLowerCase().includes(vehicleFilter.toLowerCase())) {
        return false
      }

      return true
    })
  }, [couriers, availabilityFilter, vehicleFilter])

  const handleOpenDetails = (courier: CourierDetailItem) => {
    setSelectedCourier(courier)
    setIsDrawerOpen(true)
  }

  const avatarColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b']

  const availableCount = useMemo(() => couriers.filter((c) => c.isAvailable).length, [couriers])
  const activeDeliveriesTotal = useMemo(
    () => couriers.reduce((sum, c) => sum + c.activeDeliveriesCount, 0),
    [couriers],
  )

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

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 3 Metric Cards */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricIconWrapper}>
            <ShieldCheck size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Approved couriers</span>
            <span className={styles.metricValue}>{totalCount}</span>
            <span className={styles.metricSubtext}>Ready for dispatch management</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIconWrapper}>
            <UserCheck size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Available now</span>
            <span className={styles.metricValue}>{availableCount}</span>
            <span className={styles.metricSubtext}>Accepting new assignments</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIconWrapper}>
            <Truck size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Active deliveries</span>
            <span className={styles.metricValue}>{kpis?.activeInTransit ?? activeDeliveriesTotal}</span>
            <span className={styles.metricSubtext}>Across active couriers</span>
          </div>
        </div>
      </div>

      {/* Directory Box */}
      <div className={styles.contentCard}>
        <div className={styles.cardHeaderRow}>
          <h2 className={styles.cardTitle}>Courier directory</h2>
          <Link to="/admin/users" className={styles.reviewLink}>
            Review applications ({kpis?.pendingApprovalsCount ?? 0})
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
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
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
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Loading couriers...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCouriers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    No couriers found in the database.
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
            <span className={styles.paginationText}>
              Showing {filteredCouriers.length} of {totalCount} couriers
            </span>
            <select
              className={styles.pageSelect}
              aria-label="Rows per page"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value))
                setPage(1)
              }}
            >
              <option value="5">5 per page</option>
              <option value="10">10 per page</option>
              <option value="20">20 per page</option>
            </select>

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

      {/* Slide-over Courier Details Drawer */}
      <CourierDetailsDrawer
        isOpen={isDrawerOpen}
        courier={selectedCourier}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  )
}
