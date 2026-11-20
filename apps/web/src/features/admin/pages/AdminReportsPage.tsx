import React, { useState, useMemo } from 'react'
import {
  Home,
  ChevronRight,
  Calendar,
  ChevronDown,
  User,
  MapPin,
  Download,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronLeft,
} from 'lucide-react'
import type { DeliveryReportRecord, DeliveryOutcome } from '../types/admin-reports.types'
import {
  DEFAULT_REPORTS_METRICS,
  MOCK_REPORT_RECORDS,
} from '../config/admin-reports.mock'
import styles from './AdminReportsPage.module.css'

type ReportTab = 'log' | 'summary' | 'reasons'

export const AdminReportsPage: React.FC = () => {
  const [records] = useState<readonly DeliveryReportRecord[]>(MOCK_REPORT_RECORDS)
  const [activeTab, setActiveTab] = useState<ReportTab>('log')
  const [searchQuery, setSearchQuery] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | DeliveryOutcome>('all')

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      if (outcomeFilter !== 'all' && rec.outcome !== outcomeFilter) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesTracking = rec.trackingNo.toLowerCase().includes(q)
        const matchesRecipient = rec.recipient.toLowerCase().includes(q)
        const matchesCourier = rec.courier.toLowerCase().includes(q)
        if (!matchesTracking && !matchesRecipient && !matchesCourier) return false
      }

      return true
    })
  }, [records, outcomeFilter, searchQuery])

  const handleExportCsv = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Tracking,Recipient,Courier,Zone,CompletedAt,Outcome,Reason\n' +
      records
        .map(
          (r) =>
            `${r.trackingNo},"${r.recipient}","${r.courier}","${r.zone}","${r.completedAt}","${r.outcome}","${r.evidenceOrReason}"`,
        )
        .join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `swiftdrop-delivery-report-2026-10-27.csv`)
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

      {/* Filter Toolbar & Export */}
      <div className={styles.topFilterRow}>
        <div className={styles.filterGroupLeft}>
          <button type="button" className={styles.filterButton} aria-label="Select date">
            <Calendar size={15} aria-hidden="true" />
            <span>Today, 27 Oct 2026</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>

          <button type="button" className={styles.filterButton} aria-label="Select courier">
            <User size={15} aria-hidden="true" />
            <span>All couriers</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>

          <button type="button" className={styles.filterButton} aria-label="Select zone">
            <MapPin size={15} aria-hidden="true" />
            <span>All zones</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
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
            <span className={styles.metricValue}>
              {DEFAULT_REPORTS_METRICS.completedAttempts}
            </span>
            <span className={styles.metricSubtext}>Delivered or failed</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconGreen}`}>
            <CheckCircle2 size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Delivered</span>
            <span className={styles.metricValue}>{DEFAULT_REPORTS_METRICS.deliveredCount}</span>
            <span className={styles.metricSubtext}>
              {DEFAULT_REPORTS_METRICS.successRate}% success rate
            </span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconWrapper} ${styles.iconRed}`}>
            <AlertCircle size={24} aria-hidden="true" />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Failed attempts</span>
            <span className={styles.metricValue}>{DEFAULT_REPORTS_METRICS.failedAttempts}</span>
            <span className={styles.metricSubtext}>
              {DEFAULT_REPORTS_METRICS.failureRate}% failure rate
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
              onChange={(e) => setOutcomeFilter(e.target.value as 'all' | DeliveryOutcome)}
              aria-label="Filter outcome"
            >
              <option value="all">All outcomes</option>
              <option value="Delivered">Delivered</option>
              <option value="Failed">Failed</option>
            </select>

            <select className={styles.filterSelect} aria-label="Sort order">
              <option value="latest">Latest first</option>
              <option value="oldest">Oldest first</option>
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
                <th scope="col">Zone</th>
                <th scope="col">Completed at</th>
                <th scope="col">Outcome</th>
                <th scope="col">Evidence / reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className={styles.trackingCell}>
                      <span className={styles.trackingNo}>{item.trackingNo}</span>
                      <span className={styles.recipientText}>{item.recipient}</span>
                    </div>
                  </td>
                  <td>
                    <span className={styles.courierName}>{item.courier}</span>
                  </td>
                  <td>
                    <span className={styles.zoneText}>{item.zone}</span>
                  </td>
                  <td>
                    <span className={styles.completedAt}>{item.completedAt}</span>
                  </td>
                  <td>
                    <span
                      className={`${styles.outcomePill} ${
                        item.outcome === 'Delivered'
                          ? styles.outcomeDelivered
                          : styles.outcomeFailed
                      }`}
                    >
                      {item.outcome}
                    </span>
                  </td>
                  <td>
                    {item.outcome === 'Delivered' ? (
                      <button
                        type="button"
                        className={styles.proofLink}
                        onClick={() => alert(`Showing delivery proof photo for ${item.trackingNo}`)}
                      >
                        View proof ↗
                      </button>
                    ) : (
                      <span className={styles.failureReason}>{item.evidenceOrReason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className={styles.tableFooter}>
          <div className={styles.footerLeft}>
            <span className={styles.footerCount}>Showing 1-6 of 50 attempts</span>
            <span className={styles.footerNote}>
              * Each row is one completed delivery attempt. Retries are counted separately.
            </span>
          </div>

          <div className={styles.paginationControls}>
            <button type="button" className={styles.pageBtn} aria-label="Previous">
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
            <span style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>
            <button type="button" className={styles.pageBtn}>
              9
            </button>
            <button type="button" className={styles.pageBtn} aria-label="Next">
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

