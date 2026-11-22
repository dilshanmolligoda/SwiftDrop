import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Home,
  ChevronRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { adminApi, type AdminApplicationItem } from '../api/admin-api'
import styles from './AdminReviewApplicationPage.module.css'

export const AdminReviewApplicationPage: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const [application, setApplication] = useState<(AdminApplicationItem & { reviewerName: string | null }) | null>(null)
  const [isLoading, setIsLoading] = useState(!id ? false : true)
  const [error, setError] = useState<string | null>(!id ? 'No application ID specified.' : null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [hasConfirmedCheck, setHasConfirmedCheck] = useState(false)
  const [decisionNote, setDecisionNote] = useState('')

  useEffect(() => {
    if (!id) return

    let isMounted = true

    adminApi
      .getApplicationDetails(id)
      .then((data) => {
        if (!isMounted) return
        setApplication(data)
        if (data.rejectionReason) {
          setDecisionNote(data.rejectionReason)
        }
      })
      .catch((err) => {
        if (!isMounted) return
        console.error('Failed to load application details:', err)
        setError('Application not found in the database.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [id])

  const handleApprove = async () => {
    if (!id || !application) return
    setIsSubmitting(true)
    setError(null)
    try {
      await adminApi.approveApplication(id)
      window.dispatchEvent(new Event('swiftdrop:approvals-updated'))
      const msg = `Application for ${application.fullName} has been approved successfully!`
      setSuccessMessage(msg)
      setTimeout(() => {
        navigate('/admin/users', { state: { feedbackMessage: msg } })
      }, 1500)
    } catch (err: any) {
      console.error('Failed to approve application:', err)
      setError(err.message || 'Failed to approve application.')
      setIsSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!id || !application) return
    if (!decisionNote.trim()) {
      alert('A decision note or reason is required when rejecting an application.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await adminApi.rejectApplication(id, decisionNote.trim())
      window.dispatchEvent(new Event('swiftdrop:approvals-updated'))
      const msg = `Application for ${application.fullName} has been rejected.`
      setSuccessMessage(msg)
      setTimeout(() => {
        navigate('/admin/users', { state: { feedbackMessage: msg } })
      }, 1500)
    } catch (err: any) {
      console.error('Failed to reject application:', err)
      setError(err.message || 'Failed to reject application.')
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className={styles.pageContainer}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '8px', color: '#64748b' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Loading application details...</span>
        </div>
      </div>
    )
  }

  if (error && !application) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <Link to="/admin/users" className={styles.backLink}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back to applications
          </Link>
          <h1 className={styles.pageTitle}>Review application</h1>
        </div>
        <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '24px', textAlign: 'center', marginTop: '20px' }}>
          <p style={{ fontWeight: 600, fontSize: '16px' }}>{error}</p>
          <button
            type="button"
            className={styles.backButton}
            style={{ marginTop: '16px' }}
            onClick={() => navigate('/admin/users')}
          >
            Return to user directory
          </button>
        </div>
      </div>
    )
  }

  if (!application) return null

  const initials = application.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const displayName = application.merchantProfile?.businessName || application.fullName

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

      {successMessage && (
        <div style={{ backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Card */}
      <div className={styles.summaryCard}>
        <div className={styles.summaryLeft}>
          <div className={styles.avatarCircle}>{initials}</div>
          <div className={styles.summaryInfo}>
            <span className={styles.applicantName}>{displayName}</span>
            <span className={styles.metaText}>
              {application.role} • Submitted{' '}
              {new Date(application.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>

        <span className={styles.statusPill}>{application.approvalStatus}</span>
      </div>

      {/* 2-Column Details Grid */}
      <div className={styles.detailsGrid}>
        {/* Profile specific details */}
        <div className={styles.detailsCard}>
          <h2 className={styles.cardHeading}>
            {application.role === 'MERCHANT' ? 'Business details' : 'Courier details'}
          </h2>

          <div className={styles.fieldList}>
            {application.role === 'MERCHANT' ? (
              <>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Business name</span>
                  <span className={styles.fieldValue}>
                    {application.merchantProfile?.businessName || '—'}
                  </span>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Business type</span>
                  <span className={styles.fieldValue}>
                    {application.merchantProfile?.businessType || 'Registered business'}
                  </span>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Business address</span>
                  <span className={styles.fieldValue}>
                    {application.merchantProfile?.businessAddress || '—'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Vehicle type</span>
                  <span className={styles.fieldValue}>
                    {application.courierProfile?.vehicleType || 'Not specified'}
                  </span>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>License plate</span>
                  <span className={styles.fieldValue}>
                    {application.courierProfile?.licensePlate || 'Pending registration'}
                  </span>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Driving license no.</span>
                  <span className={styles.fieldValue}>
                    {application.courierProfile?.licenseNumber || 'Verified in system'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Applicant personal details */}
        <div className={styles.detailsCard}>
          <h2 className={styles.cardHeading}>Applicant details</h2>

          <div className={styles.fieldList}>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Full name</span>
              <span className={styles.fieldValue}>{application.fullName}</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Role</span>
              <span className={styles.fieldValue}>{application.role}</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Email</span>
              <span className={styles.fieldValue}>{application.email}</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Phone</span>
              <span className={styles.fieldValue}>
                {application.phoneNumber || 'Not provided'}
              </span>
            </div>

            {application.reviewedBy && (
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Reviewed by</span>
                <span className={styles.fieldValue}>
                  {application.reviewerName || application.reviewedBy}
                </span>
              </div>
            )}
          </div>
        </div>
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
          <span>I have checked the applicant details and verified credentials.</span>
        </label>

        <div className={styles.noteSection}>
          <label htmlFor="decision-note" className={styles.noteLabel}>
            Decision note
          </label>
          <textarea
            id="decision-note"
            className={styles.decisionTextarea}
            placeholder="Add a note or reason for the applicant..."
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
          />
          <p className={styles.noteHint}>
            Required when rejecting; included in the decision notification.
          </p>
        </div>

        {successMessage && (
          <div style={{ backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        <div className={styles.decisionFooter}>
          <span className={styles.notificationNotice}>
            The applicant will be notified of your decision.
          </span>

          <div className={styles.actionButtonsGroup}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => navigate('/admin/users')}
              disabled={isSubmitting}
            >
              Back
            </button>
            <button
              type="button"
              className={styles.rejectButton}
              onClick={() => void handleReject()}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 'Reject application'}
            </button>
            <button
              type="button"
              className={styles.approveButton}
              onClick={() => void handleApprove()}
              disabled={!hasConfirmedCheck || isSubmitting}
            >
              {isSubmitting ? 'Processing...' : `Approve ${application.role.toLowerCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
