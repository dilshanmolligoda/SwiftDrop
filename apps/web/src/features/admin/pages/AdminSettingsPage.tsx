import React, { useState } from 'react'
import type {
  AdminProfileData,
  NotificationPreferencesData,
  RegionalPreferencesData,
} from '../types/admin-settings.types'
import { useAdminAuth } from '../context/AdminAuthContext'
import {
  getUserInitials,
  formatUserRole,
} from '../utils/admin-auth.util'
import styles from './AdminSettingsPage.module.css'

export const AdminSettingsPage: React.FC = () => {
  const { user } = useAdminAuth()

  // 1. Profile State
  const [profile, setProfile] = useState<AdminProfileData>(() => ({
    fullName: user?.fullName || 'Anjali Perera',
    phoneNumber: '+94 77 345 6789',
    email: user?.email || 'anjali.perera@example.com',
    role: user ? formatUserRole(user.role) : 'Dispatcher',
    initials: user ? getUserInitials(user.fullName) : 'AP',
  }))

  // 2. Regional Preferences State
  const [regional, setRegional] = useState<RegionalPreferencesData>({
    language: 'English',
    timeZone: 'Asia/Colombo (UTC+05:30)',
  })

  // 3. Notification Toggles State (auto-saves on toggle)
  const [notifications, setNotifications] = useState<NotificationPreferencesData>({
    newUnassignedParcels: true,
    failedDeliveryAttempts: true,
    newMerchantOrCourierApplications: true,
    soundAlerts: false,
  })

  // Toast / Feedback State
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const showFeedback = (message: string) => {
    setFeedbackMessage(message)
    setTimeout(() => setFeedbackMessage(null), 3000)
  }

  // Handle Profile Save
  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    showFeedback('Profile information saved successfully.')
  }

  // Handle Regional Preferences Save
  const handleRegionalSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    showFeedback('Regional preferences updated.')
  }

  // Toggle Notification handler (with auto-save)
  const handleToggleNotification = (key: keyof NotificationPreferencesData) => {
    setNotifications((prev) => {
      const updated = { ...prev, [key]: !prev[key] }
      return updated
    })
    showFeedback('Notification preferences updated automatically.')
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>
          Manage your profile, security and notification preferences.
        </p>
      </div>

      {feedbackMessage && (
        <div className={styles.toastNotice} role="status">
          <span>{feedbackMessage}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      <div className={styles.settingsGrid}>
        {/* Left Column: Profile & Regional Preferences */}
        <div className={styles.column}>
          {/* Card 1: Profile */}
          <section className={styles.card} aria-labelledby="profile-heading">
            <div className={styles.cardHeader}>
              <h2 id="profile-heading" className={styles.cardTitle}>Profile</h2>
            </div>

            <div className={styles.profileHeader}>
              <div className={styles.avatarLarge} aria-hidden="true">
                {profile.initials}
              </div>
              <div className={styles.profileActions}>
                <button
                  type="button"
                  className={styles.buttonOutlineSmall}
                  onClick={() => alert('Photo upload dialog')}
                >
                  Change photo
                </button>
                <span className={styles.roleBadge}>{profile.role}</span>
              </div>
            </div>

            <form onSubmit={handleProfileSubmit}>
              <div className={styles.formGroup}>
                <label htmlFor="full-name" className={styles.label}>Full name</label>
                <input
                  id="full-name"
                  type="text"
                  className={styles.input}
                  value={profile.fullName}
                  onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="phone-number" className={styles.label}>Phone number</label>
                <input
                  id="phone-number"
                  type="tel"
                  className={styles.input}
                  value={profile.phoneNumber}
                  onChange={(e) => setProfile({ ...profile, phoneNumber: e.target.value })}
                />
              </div>

              <div className={styles.formGroup}>
                <div className={styles.labelWrapper}>
                  <label htmlFor="email" className={styles.label}>Email</label>
                  <button
                    type="button"
                    className={styles.actionLink}
                    onClick={() => alert('Change email verification link sent.')}
                  >
                    Change
                  </button>
                </div>
                <input
                  id="email"
                  type="email"
                  className={styles.input}
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  required
                />
              </div>

              <div className={styles.cardFooter}>
                <button type="submit" className={styles.buttonPrimary}>
                  Save profile
                </button>
              </div>
            </form>
          </section>

          {/* Card 2: Regional Preferences */}
          <section className={styles.card} aria-labelledby="regional-heading">
            <div className={styles.cardHeader}>
              <h2 id="regional-heading" className={styles.cardTitle}>Regional preferences</h2>
            </div>

            <form onSubmit={handleRegionalSubmit}>
              <div className={styles.formGroup}>
                <label htmlFor="language-select" className={styles.label}>Language</label>
                <select
                  id="language-select"
                  className={styles.select}
                  value={regional.language}
                  onChange={(e) => setRegional({ ...regional, language: e.target.value })}
                >
                  <option value="English">English</option>
                  <option value="Sinhala">Sinhala (සිංහල)</option>
                  <option value="Tamil">Tamil (தமிழ்)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="timezone-select" className={styles.label}>Time zone</label>
                <select
                  id="timezone-select"
                  className={styles.select}
                  value={regional.timeZone}
                  onChange={(e) => setRegional({ ...regional, timeZone: e.target.value })}
                >
                  <option value="Asia/Colombo (UTC+05:30)">Asia/Colombo (UTC+05:30)</option>
                  <option value="UTC (UTC+00:00)">UTC (UTC+00:00)</option>
                  <option value="Asia/Singapore (UTC+08:00)">Asia/Singapore (UTC+08:00)</option>
                </select>
              </div>

              <div className={styles.cardFooter}>
                <button type="submit" className={styles.buttonSecondary}>
                  Save preferences
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* Right Column: Security & Notifications */}
        <div className={styles.column}>
          {/* Card 3: Security */}
          <section className={styles.card} aria-labelledby="security-heading">
            <div className={styles.cardHeader}>
              <h2 id="security-heading" className={styles.cardTitle}>Security</h2>
            </div>

            <div className={styles.securityList}>
              {/* Password Item */}
              <div className={styles.securityItem}>
                <div className={styles.securityLeft}>
                  <div className={styles.securityIconWrapper} aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className={styles.securityTitle}>Password</h3>
                    <p className={styles.securityDescription}>
                      Update your password regularly to keep your account secure.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.buttonOutlineSmall}
                  onClick={() => alert('Change password modal will open')}
                >
                  Change password
                </button>
              </div>

              {/* Two-step verification Item */}
              <div className={styles.securityItem}>
                <div className={styles.securityLeft}>
                  <div className={styles.securityIconWrapper} aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className={styles.securityTitle}>Two-step verification</h3>
                    <p className={styles.securityDescription}>
                      Add an extra layer of security to your account.
                    </p>
                  </div>
                </div>
                <div className={styles.securityRight}>
                  <span className={styles.statusPill}>Off</span>
                  <button
                    type="button"
                    className={styles.buttonOutlineSmall}
                    onClick={() => alert('2-step verification setup')}
                  >
                    Set up
                  </button>
                </div>
              </div>

              {/* Signed-in devices Item */}
              <div className={styles.securityItem}>
                <div className={styles.securityLeft}>
                  <div className={styles.securityIconWrapper} aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </div>
                  <div>
                    <h3 className={styles.securityTitle}>Signed-in devices</h3>
                    <p className={styles.securityDescription}>
                      Review and sign out other sessions.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.actionLink}
                  onClick={() => alert('Managing active sessions')}
                >
                  Manage →
                </button>
              </div>
            </div>
          </section>

          {/* Card 4: Notifications */}
          <section className={styles.card} aria-labelledby="notifications-heading">
            <div className={styles.cardHeader}>
              <h2 id="notifications-heading" className={styles.cardTitle}>Notifications</h2>
              <p className={styles.cardSubtitle}>Choose which in-app alerts you receive.</p>
            </div>

            <div className={styles.notificationList}>
              <div className={styles.notificationItem}>
                <span className={styles.notificationLabel}>New unassigned parcels</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.newUnassignedParcels}
                  aria-label="Toggle notifications for new unassigned parcels"
                  className={styles.switch}
                  onClick={() => handleToggleNotification('newUnassignedParcels')}
                >
                  <span
                    className={`${styles.switchTrack} ${
                      notifications.newUnassignedParcels ? styles.switchTrackActive : ''
                    }`}
                  />
                  <span
                    className={`${styles.switchThumb} ${
                      notifications.newUnassignedParcels ? styles.switchThumbActive : ''
                    }`}
                  />
                </button>
              </div>

              <div className={styles.notificationItem}>
                <span className={styles.notificationLabel}>Failed delivery attempts</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.failedDeliveryAttempts}
                  aria-label="Toggle notifications for failed delivery attempts"
                  className={styles.switch}
                  onClick={() => handleToggleNotification('failedDeliveryAttempts')}
                >
                  <span
                    className={`${styles.switchTrack} ${
                      notifications.failedDeliveryAttempts ? styles.switchTrackActive : ''
                    }`}
                  />
                  <span
                    className={`${styles.switchThumb} ${
                      notifications.failedDeliveryAttempts ? styles.switchThumbActive : ''
                    }`}
                  />
                </button>
              </div>

              <div className={styles.notificationItem}>
                <span className={styles.notificationLabel}>New merchant or courier applications</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.newMerchantOrCourierApplications}
                  aria-label="Toggle notifications for new merchant or courier applications"
                  className={styles.switch}
                  onClick={() => handleToggleNotification('newMerchantOrCourierApplications')}
                >
                  <span
                    className={`${styles.switchTrack} ${
                      notifications.newMerchantOrCourierApplications ? styles.switchTrackActive : ''
                    }`}
                  />
                  <span
                    className={`${styles.switchThumb} ${
                      notifications.newMerchantOrCourierApplications ? styles.switchThumbActive : ''
                    }`}
                  />
                </button>
              </div>

              <div className={styles.notificationItem}>
                <span className={styles.notificationLabel}>Sound alerts</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications.soundAlerts}
                  aria-label="Toggle sound alerts"
                  className={styles.switch}
                  onClick={() => handleToggleNotification('soundAlerts')}
                >
                  <span
                    className={`${styles.switchTrack} ${
                      notifications.soundAlerts ? styles.switchTrackActive : ''
                    }`}
                  />
                  <span
                    className={`${styles.switchThumb} ${
                      notifications.soundAlerts ? styles.switchThumbActive : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            <p className={styles.autoSaveNote}>Notification changes save automatically.</p>
          </section>
        </div>
      </div>

      {/* Bottom Help Link */}
      <a href="#help" className={styles.helpFooter}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>Help & support</span>
      </a>
    </div>
  )
}

