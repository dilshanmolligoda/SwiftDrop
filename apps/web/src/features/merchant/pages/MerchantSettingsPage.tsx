import React from 'react'
import { useMerchantSession } from '../session/MerchantSessionContext'
import styles from './MerchantPages.module.css'

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export const MerchantSettingsPage: React.FC = () => {
  const { user } = useMerchantSession()

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h2>Settings</h2>
        <p>Your SwiftDrop merchant account.</p>
      </div>

      <section className={styles.card}>
        <h3>Account</h3>
        <dl className={styles.details}>
          <dt>Name</dt>
          <dd>{user.fullName}</dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Account type</dt>
          <dd>Merchant</dd>
          <dt>Status</dt>
          <dd><span className={styles.badge}>{user.approvalStatus === 'APPROVED' ? 'Approved' : user.approvalStatus}</span></dd>
          <dt>Google sign-in</dt>
          <dd>{user.isGoogleLinked ? 'Connected' : 'Not connected'}</dd>
          <dt>Member since</dt>
          <dd>{formatDate(user.createdAt)}</dd>
        </dl>
      </section>
    </div>
  )
}
