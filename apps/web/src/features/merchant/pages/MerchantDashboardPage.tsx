import React from 'react'
import { Link } from 'react-router-dom'
import { useMerchantSession } from '../session/MerchantSessionContext'
import { NotConnectedNotice } from '../components/NotConnectedNotice'
import styles from './MerchantPages.module.css'

const STATS = ['Total orders', 'In transit', 'Delivered', 'Failed'] as const

const GETTING_STARTED = [
  { to: '/merchant/api-keys', title: 'Create an API key', detail: 'Your store uses it to book deliveries.' },
  { to: '/merchant/webhooks', title: 'Register a webhook URL', detail: 'Get notified on every parcel status change.' },
  { to: '/merchant/orders', title: 'Send your first order', detail: 'Orders created through the API appear here.' },
] as const

export const MerchantDashboardPage: React.FC = () => {
  const { user } = useMerchantSession()
  const firstName = user.fullName.trim().split(/\s+/)[0]

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h2>Welcome back, {firstName}</h2>
        <p>Track your store's deliveries and manage your SwiftDrop integration.</p>
      </div>

      <div className={styles.statGrid}>
        {STATS.map((label) => (
          <div key={label} className={styles.stat}>
            <span className={styles.statLabel}>{label}</span>
            <span className={styles.statValue} aria-label={`${label}: not available yet`}>—</span>
          </div>
        ))}
      </div>
      <NotConnectedNotice>
        Order statistics will appear here once the parcels service is connected.
      </NotConnectedNotice>

      <section className={styles.card}>
        <h3>Getting started</h3>
        <ol className={styles.steps}>
          {GETTING_STARTED.map((step, index) => (
            <li key={step.to}>
              <Link to={step.to} className={styles.step}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <span className={styles.stepText}>
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
