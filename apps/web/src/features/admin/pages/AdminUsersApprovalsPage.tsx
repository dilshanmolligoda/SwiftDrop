import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Users,
  Search,
  Home,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import type { ApplicationItem, ApplicationType } from '../types/admin-users.types'
import { adminApi, type AdminApplicationItem, type AdminDashboardKpis } from '../api/admin-api'
import styles from './AdminUsersApprovalsPage.module.css'

type TabOption = 'pending' | 'customers' | 'merchants' | 'couriers'

function mapAdminAppToItem(app: AdminApplicationItem): ApplicationItem {
  const initials = app.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  let status: 'Pending review' | 'Approved' | 'Rejected' = 'Pending review'
  if (app.approvalStatus === 'APPROVED') status = 'Approved'
  else if (app.approvalStatus === 'REJECTED') status = 'Rejected'

  return {
    id: app.id,
    applicantName: app.fullName,
    businessName: app.merchantProfile?.businessName || (app.role === 'COURIER' ? `${app.fullName} (Courier)` : undefined),
    ownerName: app.role === 'MERCHANT' ? app.fullName : undefined,
    email: app.email,
    phone: app.phoneNumber || 'Not provided',
    initials: initials || 'AP',
    type: app.role === 'MERCHANT' ? 'Merchant' : 'Courier',
    submittedDate: new Date(app.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    submittedTimeAgo: 'Recently',
    status,
    documents: [
      {
        title: app.role === 'MERCHANT' ? 'Business Registration' : 'Driving License',
        fileType: 'PDF',
        verified: app.approvalStatus === 'APPROVED',
      },
    ],
    notes: app.rejectionReason || undefined,
  }
}

export const AdminUsersApprovalsPage: React.FC = () => {
  const navigate = useNavigate()
  const [applications, setApplications] = useState<ApplicationItem[]>([])
  const [kpis, setKpis] = useState<AdminDashboardKpis | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [activeTab, setActiveTab] = useState<TabOption>('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | ApplicationType>('all')

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()

    async function fetchApps() {
      try {
        let statusParam: string | undefined = undefined
        let roleParam: string | undefined = undefined

        if (activeTab === 'pending') {
          statusParam = 'PENDING'
        } else if (activeTab === 'merchants') {
          roleParam = 'MERCHANT'
        } else if (activeTab === 'couriers') {
          roleParam = 'COURIER'
        }

        const [appsRes, dashboardRes] = await Promise.all([
          adminApi.getApplications({
            page,
            limit,
            search: searchQuery.trim() || undefined,
            status: statusParam,
            role: roleParam,
          }),
          adminApi.getDashboard(controller.signal),
        ])

        if (!isMounted) return
        const mapped = (appsRes.data || []).map(mapAdminAppToItem)
        setApplications(mapped)
        setTotalPages(appsRes.pagination?.totalPages || 1)
        setTotalCount(appsRes.pagination?.total || 0)
        setKpis(dashboardRes.kpis)
      } catch (err: unknown) {
        if (!isMounted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('Failed to load applications:', err)
        setError('Could not load user applications from backend.')
        setApplications([])
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void fetchApps()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [activeTab, page, limit, searchQuery])

  const pendingCount = kpis?.pendingApprovalsCount ?? 0

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      if (typeFilter !== 'all' && app.type !== typeFilter) return false
      return true
    })
  }, [applications, typeFilter])

  const handleOpenReview = (app: ApplicationItem) => {
    navigate(`/admin/users/review/${app.id}`)
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

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 2 Metric KPI Cards */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconOrange}`}>
            <FileText size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Awaiting review</span>
            <span className={styles.metricValue}>{pendingCount}</span>
            <span className={styles.metricSubtext}>Pending admin approval</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGreen}`}>
            <Users size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Active couriers</span>
            <span className={styles.metricValue}>{kpis?.activeCouriersCount ?? 0}</span>
            <span className={styles.metricSubtext}>Approved and operational</span>
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
            onClick={() => {
              setActiveTab('pending')
              setPage(1)
            }}
          >
            Pending approvals ({pendingCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'customers'}
            className={`${styles.tabButton} ${activeTab === 'customers' ? styles.tabButtonActive : ''}`}
            onClick={() => {
              setActiveTab('customers')
              setPage(1)
            }}
          >
            Customers
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'merchants'}
            className={`${styles.tabButton} ${activeTab === 'merchants' ? styles.tabButtonActive : ''}`}
            onClick={() => {
              setActiveTab('merchants')
              setPage(1)
            }}
          >
            Merchants
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'couriers'}
            className={`${styles.tabButton} ${activeTab === 'couriers' ? styles.tabButtonActive : ''}`}
            onClick={() => {
              setActiveTab('couriers')
              setPage(1)
            }}
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
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
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
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Loading applications...</span>
                    </div>
                  </td>
                </tr>
              ) : activeTab === 'customers' ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    Customer accounts are automatically verified upon registration.
                  </td>
                </tr>
              ) : filteredApplications.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    No applications found in the database.
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
                      <span className={styles.submittedDate}>{app.submittedDate}</span>
                    </td>
                    <td>
                      <span
                        className={`${styles.statusPill} ${
                          app.status === 'Approved'
                            ? styles.statusApproved
                            : app.status === 'Rejected'
                              ? styles.statusRejected
                              : styles.statusPending
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
                        Review
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
          <span className={styles.footerNote}>
            All merchant and courier signups require administrative verification.
          </span>

          <div className={styles.paginationControls}>
            <span className={styles.paginationText}>
              Showing {filteredApplications.length} of {totalCount} applications
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
    </div>
  )
}
