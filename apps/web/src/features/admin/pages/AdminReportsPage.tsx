import React, { useState, useMemo, useEffect } from 'react'
import {
  Home,
  ChevronRight,
  Calendar,
  Download,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronLeft,
  Loader2,
} from 'lucide-react'
import type { DeliveryOutcome } from '../types/admin-reports.types'
import { adminApi, type AdminReportsLogItem } from '../api/admin-api'
import styles from './AdminReportsPage.module.css'

type ReportTab = 'log' | 'summary' | 'reasons'

function formatDateTime(isoString: string): string {
  if (!isoString) return '—'
  const d = new Date(isoString)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ', ' +
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export const AdminReportsPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })

  const [logs, setLogs] = useState<AdminReportsLogItem[]>([])
  const [metrics, setMetrics] = useState({
    completedAttempts: 0,
    delivered: 0,
    failed: 0,
    successRate: 0,
    failureRate: 0,
  })

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [activeTab, setActiveTab] = useState<ReportTab>('log')
  const [searchQuery, setSearchQuery] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | DeliveryOutcome>('all')

  useEffect(() => {
    let isMounted = true

    async function fetchReports() {
      try {
        const res = await adminApi.getReports({
          page,
          limit,
          date: selectedDate,
          status: outcomeFilter === 'Delivered' ? 'DELIVERED' : outcomeFilter === 'Failed' ? 'FAILED' : undefined,
        })

        if (!isMounted) return
        setLogs(res.logs || [])
        setMetrics(res.metrics || {
          completedAttempts: 0,
          delivered: 0,
          failed: 0,
          successRate: 0,
          failureRate: 0,
        })
        setTotalPages(res.pagination?.totalPages || 1)
        setTotalCount(res.pagination?.total || 0)
      } catch (err: unknown) {
        if (!isMounted) return
        console.error('Failed to load reports:', err)
        setError('Could not load reports from backend.')
        setLogs([])
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void fetchReports()

    return () => {
      isMounted = false
    }
  }, [selectedDate, outcomeFilter, page, limit])

  const filteredLogs = useMemo(() => {
    return logs.filter((rec) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesTracking = rec.trackingNumber.toLowerCase().includes(q)
        const matchesRecipient = rec.recipientName.toLowerCase().includes(q)
        const matchesCourier = rec.courierName.toLowerCase().includes(q)
        if (!matchesTracking && !matchesRecipient && !matchesCourier) return false
      }
      return true
    })
  }, [logs, searchQuery])

  const handleExportCsv = () => {
    if (logs.length === 0) {
      alert('No delivery logs to export for this date.')
      return
    }

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Tracking Number,Recipient,Address,Courier,Outcome,Reason,Completed At\n' +
      logs
        .map(
          (r) =>
            `"${r.trackingNumber}","${r.recipientName}","${r.recipientAddress}","${r.courierName}","${r.status}","${r.failureReason || ''}","${r.completedAt}"`,
        )
        .join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `swiftdrop-report-${selectedDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.breadcrumb} aria-label="Breadcrumb">
          <Home size={14} aria-hidden="true" />
          <ChevronRight size={12} aria-hidden="true" />
          <span className={styles.breadcrumbCurrent}>Reports</span>
        </div>
        <h1 className={styles.pageTitle}>Reports</h1>
        <p className={styles.pageSubtitle}>
          Review delivery outcomes and download daily records.
        </p>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Toolbar & Export */}
      <div className={styles.topFilterRow}>
        <div className={styles.filterGroupLeft}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ffffff', border: '1px solid #d1d5db', borderRadius: '8px', padding: '6px 12px' }}>
            <Calendar size={16} style={{ color: '#64748b' }} aria-hidden="true" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(e.target.value)
                  setPage(1)
                }
              }}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '14px', color: '#1e293b' }}
              aria-label="Select report date"
            />
          </div>
        </div>

        <button type="button" className={styles.exportButton} onClick={handleExportCsv}>
          <Download size={15} aria-hidden="true" />
          Export CSV
        </button>
      </div>

      <p className={styles.timeNotice}>
        Based on attempt completion time • Sri Lanka time (UTC+05:30)
      </p>

      {/* 3 Stat KPI Cards */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGray}`}>
            <Calendar size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Completed attempts</span>
            <span className={styles.metricValue}>{metrics.completedAttempts}</span>
            <span className={styles.metricSubtext}>Delivered or failed</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGreen}`}>
            <CheckCircle2 size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Delivered</span>
            <span className={styles.metricValue}>{metrics.delivered}</span>
            <span className={styles.metricSubtext}>
              {metrics.successRate}% success rate
            </span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconRed}`}>
            <AlertCircle size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Failed attempts</span>
            <span className={styles.metricValue}>{metrics.failed}</span>
            <span className={styles.metricSubtext}>
              {metrics.failureRate}% failure rate
            </span>
          </div>
        </div>
      </div>

      {/* Reports Table Container */}
      <div className={styles.contentCard}>
        {/* Tabs */}
        <div className={styles.tabsRow} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'log'}
            className={`${styles.tabButton} ${activeTab === 'log' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('log')}
          >
            Daily delivery log
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'summary'}
            className={`${styles.tabButton} ${activeTab === 'summary' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            Daily summary
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'reasons'}
            className={`${styles.tabButton} ${activeTab === 'reasons' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('reasons')}
          >
            Failure reasons
          </button>
        </div>

        {/* Toolbar */}
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

          <div className={styles.rightFilters}>
            <select
              className={styles.filterSelect}
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value as 'all' | DeliveryOutcome)
                setPage(1)
              }}
              aria-label="Filter outcome"
            >
              <option value="all">All outcomes</option>
              <option value="Delivered">Delivered</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.reportsTable}>
            <thead>
              <tr>
                <th scope="col">Tracking / Recipient</th>
                <th scope="col">Courier</th>
                <th scope="col">Destination Address</th>
                <th scope="col">Completed at</th>
                <th scope="col">Outcome</th>
                <th scope="col">Reason / Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Loading delivery reports...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    No delivery records found for the selected date.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((item) => {
                  const isDelivered = item.status === 'DELIVERED'
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className={styles.trackingCell}>
                          <span className={styles.trackingNo}>{item.trackingNumber}</span>
                          <span className={styles.recipientText}>{item.recipientName}</span>
                        </div>
                      </td>
                      <td>
                        <span className={styles.courierName}>{item.courierName}</span>
                      </td>
                      <td>
                        <span className={styles.zoneText}>{item.recipientAddress}</span>
                      </td>
                      <td>
                        <span className={styles.completedAt}>
                          {formatDateTime(item.completedAt)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`${styles.outcomePill} ${
                            isDelivered ? styles.outcomeDelivered : styles.outcomeFailed
                          }`}
                        >
                          {isDelivered ? 'Delivered' : 'Failed'}
                        </span>
                      </td>
                      <td>
                        <span className={styles.failureReason}>
                          {item.failureReason || (isDelivered ? 'Successful delivery' : 'No reason provided')}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className={styles.tableFooter}>
          <div className={styles.footerLeft}>
            <span className={styles.footerCount}>
              Showing {filteredLogs.length} of {totalCount} attempts
            </span>
            <span className={styles.footerNote}>
              * Each row is one completed delivery attempt.
            </span>
          </div>

          <div className={styles.paginationControls}>
            <span style={{ fontSize: '13px', color: '#64748b', marginRight: '8px' }}>
              Rows:
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
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </select>

            <button
              type="button"
              className={styles.pageBtn}
              aria-label="Previous"
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
              aria-label="Next"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
