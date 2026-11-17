import React, { useState, useEffect } from 'react'
import { X, FileText, CheckCircle2 } from 'lucide-react'
import type { ApplicationItem } from '../types/admin-users.types'
import styles from './ApplicationReviewModal.module.css'

interface ApplicationReviewModalProps {
  readonly isOpen: boolean
  readonly application: ApplicationItem | null
  readonly onClose: () => void
  readonly onApprove: (id: string) => void
  readonly onReject: (id: string, reason: string) => void
}

export const ApplicationReviewModal: React.FC<ApplicationReviewModalProps> = ({
  isOpen,
  application,
  onClose,
  onApprove,
  onReject,
}) => {
  const [isRejecting, setIsRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !application) {
    return null
  }

  const handleConfirmReject = () => {
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejecting this application.')
      return
    }
    onReject(application.id, rejectReason)
    setIsRejecting(false)
    setRejectReason('')
  }

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-app-title"
      >
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.titleGroup}>
            <h2 id="review-app-title" className={styles.title}>
              Review application
            </h2>
            <span
              className={`${styles.typeBadge} ${
                application.type === 'Merchant' ? styles.typeMerchant : styles.typeCourier
              }`}
            >
              {application.type}
            </span>
          </div>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          <div className={styles.infoCard}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Applicant / Business</span>
              <span className={styles.infoValue}>
                {application.businessName || application.applicantName}
              </span>
            </div>
            {application.ownerName && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Owner / Contact</span>
                <span className={styles.infoValue}>{application.ownerName}</span>
              </div>
            )}
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Email</span>
              <span className={styles.infoValue}>{application.email}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Phone</span>
              <span className={styles.infoValue}>{application.phone}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Submitted</span>
              <span className={styles.infoValue}>
                {application.submittedDate} ({application.submittedTimeAgo})
              </span>
            </div>

            {application.notes && (
              <div className={styles.notesBox}>
                <strong>Onboarding note:</strong> {application.notes}
              </div>
            )}
          </div>

          {/* Verification Documents */}
          <div className={styles.documentsSection}>
            <h3 className={styles.sectionTitle}>Verification documents ({application.documents.length})</h3>
            {application.documents.map((doc) => (
              <div key={doc.title} className={styles.docItem}>
                <div className={styles.docLeft}>
                  <div className={styles.docIconWrapper}>
                    <FileText size={18} aria-hidden="true" />
                  </div>
                  <span className={styles.docTitle}>{doc.title}</span>
                </div>
                <span className={styles.verifiedPill}>
                  <CheckCircle2 size={12} aria-hidden="true" />
                  Verified
                </span>
              </div>
            ))}
          </div>

          {/* Rejection reason box */}
          {isRejecting && (
            <div className={styles.rejectionBox}>
              <label htmlFor="rejection-reason" className={styles.rejectionLabel}>
                Reason for rejection (will be emailed to the applicant):
              </label>
              <input
                id="rejection-reason"
                type="text"
                className={styles.rejectionInput}
                placeholder="e.g. Expired revenue license or incomplete business documentation."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <div className={styles.footerLeft}>
            {isRejecting ? (
              <button
                type="button"
                className={styles.rejectBtn}
                onClick={handleConfirmReject}
              >
                Confirm rejection
              </button>
            ) : (
              <button
                type="button"
                className={styles.rejectBtn}
                onClick={() => setIsRejecting(true)}
              >
                Reject application
              </button>
            )}
          </div>

          <button
            type="button"
            className={styles.approveBtn}
            onClick={() => onApprove(application.id)}
          >
            Approve application
          </button>
        </div>
      </div>
    </div>
  )
}
