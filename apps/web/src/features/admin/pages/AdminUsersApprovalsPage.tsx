import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Users,
  Search,
  Home,
  ChevronRight,
} from 'lucide-react'
import type { ApplicationItem, ApplicationType } from '../types/admin-users.types'
import { DEFAULT_USER_SUMMARY, MOCK_APPLICATIONS } from '../config/admin-users.mock'
import { ApplicationReviewModal } from '../components/ApplicationReviewModal'
import styles from './AdminUsersApprovalsPage.module.css'

type TabOption = 'pending' | 'customers' | 'merchants' | 'couriers'

export const AdminUsersApprovalsPage: React.FC = () => {
  const navigate = useNavigate()
  const [applications, setApplications] = useState<ApplicationItem[]>(() => [...MOCK_APPLICATIONS])
  const [activeTab, setActiveTab] = useState<TabOption>('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'Merchant' | 'Courier'>('all')
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest')
  const [selectedApplication, setSelectedApplication] = useState<ApplicationItem | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const pendingCount = useMemo(
    () => applications.filter((a) => a.status === 'Pending review').length,
    [applications],
  )

  const filteredApplications = useMemo(() => {
    return applications
      .filter((app) => {
        // Tab filter
        if (activeTab === 'pending' && app.status !== 'Pending review') return false
        if (activeTab === 'merchants' && app.type !== 'Merchant') return false
        if (activeTab === 'couriers' && app.type !== 'Courier') return false
        // For customers tab, there are no applications, but let's handle gracefully
        if (activeTab === 'customers') return false

        // Type filter dropdown
        if (typeFilter !== 'all' && app.type !== typeFilter) return false

        // Search query
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase()
          const matchesName = app.applicantName.toLowerCase().includes(query)
          const matchesBusiness = app.businessName?.toLowerCase().includes(query) ?? false
          const matchesOwner = app.ownerName?.toLowerCase().includes(query) ?? false
          const matchesEmail = app.email.toLowerCase().includes(query)
          if (!matchesName && !matchesBusiness && !matchesOwner && !matchesEmail) {
            return false
          }
        }

        return true
      })
      .sort((a, b) => {
        if (sortOrder === 'newest') {
          return b.id.localeCompare(a.id)
        }
        return a.id.localeCompare(b.id)
      })
  }, [applications, activeTab, typeFilter, searchQuery, sortOrder])

  const handleOpenReview = (app: ApplicationItem) => {
    navigate(`/admin/users/review/${app.id}`)
  }

  const handleApprove = (id: string) => {
    setApplications((prev) =>
      prev.map((app) =>
        app.id === id ? { ...app, status: 'Approved' } : app,
      ),
    )
    setIsModalOpen(false)
    setSelectedApplication(null)
  }

  const handleReject = (id: string, reason: string) => {
    setApplications((prev) =>
      prev.map((app) =>
        app.id === id ? { ...app, status: 'Rejected', notes: `Rejected: ${reason}` } : app,
      ),
    )
    setIsModalOpen(false)
    setSelectedApplication(null)
  }

  return (
    <div className={styles.pageContainer}>
      {/* Header and Breadcrumb */}
      <div className={styles.pageHeader}>
        <div className={styles.breadcrumb} aria-label="Breadcrumb">
          <Home size={14} aria-hidden="true" />
          <ChevronRight size={12} aria-hidden="true" />
          <span className={styles.breadcrumbCurrent}>Users & approvals</span>
        </div>
        <h1 className={styles.pageTitle}>Users & approvals</h1>
        <p className={styles.pageSubtitle}>
          Review applications and manage customer, merchant and courier accounts.
        </p>
      </div>

      {/* 2 Metric KPI Cards */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconOrange}`}>
            <FileText size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Awaiting review</span>
            <span className={styles.metricValue}>{pendingCount}</span>
            <span className={styles.metricSubtext}>2 merchants • 2 couriers</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGreen}`}>
            <Users size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Active accounts</span>
            <span className={styles.metricValue}>{DEFAULT_USER_SUMMARY.totalActive}</span>
            <span className={styles.metricSubtext}>
              {DEFAULT_USER_SUMMARY.totalCustomers} customers • {DEFAULT_USER_SUMMARY.totalMerchants}{' '}
              merchants • {DEFAULT_USER_SUMMARY.totalCouriers} couriers
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Box */}
      <div className={styles.contentCard}>
        {/* Filter Tabs */}
        <div className={styles.tabsRow} role="tablist" aria-label="User directory tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pending'}
            className={`${styles.tabButton} ${activeTab === 'pending' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending approvals ({pendingCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'customers'}
            className={`${styles.tabButton} ${activeTab === 'customers' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('customers')}
          >
            Customers
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'merchants'}
            className={`${styles.tabButton} ${activeTab === 'merchants' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('merchants')}
          >
            Merchants
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'couriers'}
            className={`${styles.tabButton} ${activeTab === 'couriers' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('couriers')}
          >
            Couriers
          </button>
        </div>

        {/* Filter Controls Toolbar */}
        <div className={styles.filterBar}>
          <div className={styles.searchInputWrapper}>
            <Search size={16} className={styles.searchIcon} aria-hidden="true" />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search name, business or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search name, business or email"
            />
          </div>

          <div className={styles.dropdownGroup}>
            <select
              className={styles.filterSelect}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | ApplicationType)}
              aria-label="Filter application type"
            >
              <option value="all">All application types</option>
              <option value="Merchant">Merchant</option>
              <option value="Courier">Courier</option>
            </select>

            <select
              className={styles.filterSelect}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'oldest' | 'newest')}
              aria-label="Sort order"
            >
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
            </select>
          </div>
        </div>

        {/* Applications Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.applicationsTable}>
            <thead>
              <tr>
                <th scope="col">Applicant</th>
                <th scope="col">Type</th>
                <th scope="col">Submitted</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredApplications.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    {activeTab === 'customers'
                      ? 'Customer accounts are automatically verified upon registration.'
                      : 'No applications found matching your criteria.'}
                  </td>
                </tr>
              ) : (
                filteredApplications.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <div className={styles.applicantCell}>
                        <div className={styles.avatarCircle}>{app.initials}</div>
                        <div className={styles.applicantDetails}>
                          <span className={styles.applicantName}>
                            {app.businessName || app.applicantName}
                          </span>
                          {app.ownerName && (
                            <span className={styles.ownerText}>Owner: {app.ownerName}</span>
                          )}
                          <span className={styles.emailText}>{app.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`${styles.typeBadge} ${
                          app.type === 'Merchant' ? styles.typeMerchant : styles.typeCourier
                        }`}
                      >
                        {app.type}
                      </span>
                    </td>
                    <td>
                      <div className={styles.submittedCell}>
                        <span className={styles.submittedDate}>{app.submittedDate}</span>
                        <span className={styles.submittedTimeAgo}>{app.submittedTimeAgo}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`${styles.statusPill} ${
                          app.status === 'Approved'
                            ? styles.statusApproved
                            : app.status === 'Rejected'
                            ? styles.statusRejected
                            : ''
                        }`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.reviewButton}
                        onClick={() => handleOpenReview(app)}
                      >
                        Review application
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className={styles.tableFooter}>
          <span className={styles.footerCount}>
            Showing all {filteredApplications.length} applications
          </span>
          <span className={styles.footerNote}>
            Review business or vehicle documents before approving an application.
          </span>
        </div>
      </div>

      {/* Review Modal */}
      <ApplicationReviewModal
        isOpen={isModalOpen}
        application={selectedApplication}
        onClose={() => setIsModalOpen(false)}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  )
}

