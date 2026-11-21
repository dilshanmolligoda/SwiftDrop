import React, { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Home,
  ChevronRight,
  ArrowLeft,
  FileText,
  Download,
  ExternalLink,
} from 'lucide-react'
import { MOCK_APPLICATIONS } from '../config/admin-users.mock'
import styles from './AdminReviewApplicationPage.module.css'

export const AdminReviewApplicationPage: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const application =
    MOCK_APPLICATIONS.find((app) => app.id === id) || MOCK_APPLICATIONS[0]

  const [hasConfirmedCheck, setHasConfirmedCheck] = useState(false)
  const [decisionNote, setDecisionNote] = useState('')
  const [currentStatus, setCurrentStatus] = useState<string>(application.status)

  const handleApprove = () => {
    setCurrentStatus('Approved')
    alert(`Application for ${application.applicantName} has been approved! The applicant will be notified via email.`)
    navigate('/admin/users')
  }

  const handleReject = () => {
    if (!decisionNote.trim()) {
      alert('Decision note is required when rejecting an application.')
      return
    }
    setCurrentStatus('Rejected')
    alert(`Application for ${application.applicantName} has been rejected. Notification sent with reason: "${decisionNote}".`)
    navigate('/admin/users')
  }

  return (
    <div className={styles.pageContainer}>
      {/* Header & Breadcrumb */}
      <div className={styles.pageHeader}>
        <div className={styles.breadcrumb} aria-label="Breadcrumb">
          <Home size={14} aria-hidden="true" />
          <ChevronRight size={12} aria-hidden="true" />
          <Link to="/admin/users" style={{ color: 'inherit', textDecoration: 'none' }}>
            Users & approvals
          </Link>
          <ChevronRight size={12} aria-hidden="true" />
          <span className={styles.breadcrumbCurrent}>Review application</span>
        </div>

        <Link to="/admin/users" className={styles.backLink}>
          <ArrowLeft size={16} aria-hidden="true" />
          Back to applications
        </Link>

        <h1 className={styles.pageTitle}>Review application</h1>
      </div>

      {/* Summary Card */}
      <div className={styles.summaryCard}>
        <div className={styles.summaryLeft}>
          <div className={styles.avatarCircle}>{application.initials}</div>
          <div className={styles.summaryInfo}>
            <span className={styles.applicantName}>
              {application.businessName || application.applicantName}
            </span>
            <span className={styles.metaText}>
              {application.type.toUpperCase()} • APP-0028 • Submitted {application.submittedDate}
            </span>
          </div>
        </div>

        <span className={styles.statusPill}>{currentStatus}</span>
      </div>

      {/* 2-Column Details Grid */}
      <div className={styles.detailsGrid}>
        {/* Business details */}
        <div className={styles.detailsCard}>
          <h2 className={styles.cardHeading}>Business details</h2>

          <div className={styles.fieldList}>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Business name</span>
              <span className={styles.fieldValue}>
                {application.businessName || application.applicantName}
              </span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Business type</span>
              <span className={styles.fieldValue}>Sole proprietorship</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Registration number</span>
              <span className={styles.fieldValue}>BR 2026-03482</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Business address</span>
              <span className={styles.fieldValue}>42 Galle Road, Colombo 03</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Website</span>
              <a
                href="https://lankastyle.example"
                target="_blank"
                rel="noreferrer"
                className={styles.websiteLink}
              >
                lankastyle.example
              </a>
            </div>
          </div>
        </div>

        {/* Applicant details */}
        <div className={styles.detailsCard}>
          <h2 className={styles.cardHeading}>Applicant details</h2>

          <div className={styles.fieldList}>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Full name</span>
              <span className={styles.fieldValue}>{application.ownerName || application.applicantName}</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Role</span>
              <span className={styles.fieldValue}>Business owner</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Email</span>
              <span className={styles.fieldValue}>{application.email}</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Phone</span>
              <span className={styles.fieldValue}>{application.phone}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Submitted documents Section */}
      <div className={styles.documentsCard}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Submitted documents</h2>
          <span className={styles.sectionSubtitle}>
            Open each PDF to check the submitted details.
          </span>
        </div>

        <div className={styles.documentsList}>
          <div className={styles.docItem}>
            <div className={styles.docLeft}>
              <div className={styles.pdfIcon}>
                <FileText size={18} aria-hidden="true" />
              </div>
              <div className={styles.docMeta}>
                <span className={styles.docName}>business-registration.pdf</span>
                <span className={styles.docSub}>Business registration • PDF • 1.2 MB</span>
              </div>
            </div>

            <div className={styles.docActions}>
              <button
                type="button"
                className={styles.openPdfButton}
                onClick={() => alert('Opening business-registration.pdf preview...')}
              >
                <ExternalLink size={14} aria-hidden="true" />
                Open PDF
              </button>
              <button
                type="button"
                className={styles.downloadIconBtn}
                aria-label="Download business-registration.pdf"
                onClick={() => alert('Downloading business-registration.pdf...')}
              >
                <Download size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className={styles.docItem}>
            <div className={styles.docLeft}>
              <div className={styles.pdfIcon}>
                <FileText size={18} aria-hidden="true" />
              </div>
              <div className={styles.docMeta}>
                <span className={styles.docName}>ownership-proof.pdf</span>
                <span className={styles.docSub}>Electricity / utility bill • PDF • 840 KB</span>
              </div>
            </div>

            <div className={styles.docActions}>
              <button
                type="button"
                className={styles.openPdfButton}
                onClick={() => alert('Opening ownership-proof.pdf preview...')}
              >
                <ExternalLink size={14} aria-hidden="true" />
                Open PDF
              </button>
              <button
                type="button"
                className={styles.downloadIconBtn}
                aria-label="Download ownership-proof.pdf"
                onClick={() => alert('Downloading ownership-proof.pdf...')}
              >
                <Download size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <p className={styles.pdfDisclaimer}>PDFs open in a new tab.</p>
      </div>

      {/* Review decision */}
      <div className={styles.decisionCard}>
        <h2 className={styles.sectionTitle}>Review decision</h2>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={hasConfirmedCheck}
            onChange={(e) => setHasConfirmedCheck(e.target.checked)}
          />
          <span>I have checked the business details and supporting documents.</span>
        </label>

        <div className={styles.noteSection}>
          <label htmlFor="decision-note" className={styles.noteLabel}>
            Decision note
          </label>
          <textarea
            id="decision-note"
            className={styles.decisionTextarea}
            placeholder="Add a note for the applicant..."
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
          />
          <p className={styles.noteHint}>
            Required when rejecting; included in the decision notification.
          </p>
        </div>

        <div className={styles.decisionFooter}>
          <span className={styles.notificationNotice}>
            The applicant will be notified of your decision.
          </span>

          <div className={styles.actionButtonsGroup}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => navigate('/admin/users')}
            >
              Back
            </button>
            <button
              type="button"
              className={styles.rejectButton}
              onClick={handleReject}
            >
              Reject application
            </button>
            <button
              type="button"
              className={styles.approveButton}
              onClick={handleApprove}
              disabled={!hasConfirmedCheck}
            >
              Approve merchant
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

