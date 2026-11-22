import React, { useState, useMemo } from 'react'
import {
  Home,
  ChevronRight,
  Plus,
  Search,
  Edit2,
  Info,
} from 'lucide-react'
import type { ZonePricingItem } from '../types/admin-pricing.types'
import { MOCK_ZONES } from '../config/admin-pricing.mock'
import { ZoneModal } from '../components/ZoneModal'
import { AdminFilterSelect } from '../components/AdminFilterSelect'
import styles from './AdminPricingPage.module.css'

export const AdminPricingPage: React.FC = () => {
  const [zones, setZones] = useState<ZonePricingItem[]>(() => [...MOCK_ZONES])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [selectedZone, setSelectedZone] = useState<ZonePricingItem | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const activeCount = useMemo(() => zones.filter((z) => z.isActive).length, [zones])

  const filteredZones = useMemo(() => {
    return zones.filter((z) => {
      if (statusFilter === 'active' && !z.isActive) return false
      if (statusFilter === 'inactive' && z.isActive) return false

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesName = z.name.toLowerCase().includes(query)
        const matchesAreas = z.coveredAreas.toLowerCase().includes(query)
        if (!matchesName && !matchesAreas) return false
      }

      return true
    })
  }, [zones, statusFilter, searchQuery])

  const handleOpenAdd = () => {
    setSelectedZone(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (zone: ZonePricingItem) => {
    setSelectedZone(zone)
    setIsModalOpen(true)
  }

  const handleSaveZone = (savedZone: ZonePricingItem) => {
    setZones((prev) => {
      const exists = prev.some((z) => z.id === savedZone.id)
      if (exists) {
        return prev.map((z) => (z.id === savedZone.id ? savedZone : z))
      }
      return [...prev, savedZone]
    })
    setIsModalOpen(false)
  }

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerTextGroup}>
          <div className={styles.breadcrumb} aria-label="Breadcrumb">
            <Home size={14} aria-hidden="true" />
            <ChevronRight size={12} aria-hidden="true" />
            <span className={styles.breadcrumbCurrent}>Zones & pricing</span>
          </div>
          <h1 className={styles.pageTitle}>Zones & pricing</h1>
          <p className={styles.pageSubtitle}>
            Manage service coverage and delivery charges.
          </p>
        </div>

        <button type="button" className={styles.addZoneButton} onClick={handleOpenAdd}>
          <Plus size={16} aria-hidden="true" />
          Add zone
        </button>
      </div>

      {/* Delivery Zones Table Card */}
      <div className={styles.contentCard}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Delivery zones</h2>
          <span className={styles.cardSubtitle}>
            {zones.length} zones • {activeCount} active
          </span>
        </div>

        {/* Toolbar */}
        <div className={styles.filterBar}>
          <div className={styles.searchInputWrapper}>
            <Search size={16} className={styles.searchIcon} aria-hidden="true" />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search zone or area"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search zone or area"
            />
          </div>

          <div className={styles.rightFilters}>
            <AdminFilterSelect
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as 'all' | 'active' | 'inactive')}
              ariaLabel="Filter status"
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />

            <span className={styles.currencyIndicator}>Currency: LKR</span>
          </div>
        </div>

        {/* Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.zonesTable}>
            <thead>
              <tr>
                <th scope="col">Zone</th>
                <th scope="col">Covered areas</th>
                <th scope="col">Base fee (first 1 kg)</th>
                <th scope="col">Extra / kg (each started kg)</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredZones.map((zone) => (
                <tr key={zone.id}>
                  <td>
                    <span className={styles.zoneName}>{zone.name}</span>
                  </td>
                  <td>
                    <span className={styles.coveredAreas}>{zone.coveredAreas}</span>
                  </td>
                  <td>
                    <span className={styles.feeNumber}>{zone.baseFeeLkr}</span>
                  </td>
                  <td>
                    <span className={styles.feeNumber}>{zone.extraPerKgLkr}</span>
                  </td>
                  <td>
                    <span className={styles.statusIndicator}>
                      <span
                        className={zone.isActive ? styles.dotActive : styles.dotInactive}
                        aria-hidden="true"
                      />
                      {zone.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.editButton}
                      onClick={() => handleOpenEdit(zone)}
                    >
                      <Edit2 size={12} aria-hidden="true" />
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.tableFooter}>
          <span>Showing all {filteredZones.length} zones</span>
        </div>
      </div>

      {/* How Pricing Works Card */}
      <div className={styles.howItWorksCard}>
        <div className={styles.howItWorksTop}>
          <Info size={18} aria-hidden="true" />
          <span>How pricing works</span>
        </div>
        <p className={styles.howItWorksBody}>
          Destination zone sets the rate. The base fee covers the first 1 kg; each additional started
          kg adds the extra charge.
          <br />
          <strong>Example:</strong> 2.5 kg to Colombo Central = LKR 350 + (2 × 80) = LKR 510.
        </p>
        <p className={styles.howItWorksDisclaimer}>
          Rate changes apply to new bookings. Existing delivery fees stay unchanged.
        </p>
      </div>

      {/* Add / Edit Zone Modal */}
      <ZoneModal
        isOpen={isModalOpen}
        zone={selectedZone}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveZone}
      />
    </div>
  )
}

