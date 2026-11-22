import React, { useState, useRef } from 'react'
import { X, Lock, Shield, Laptop, CheckCircle2, Trash2 } from 'lucide-react'
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
  const { user, logout } = useAdminAuth()

  // 1. Profile State
  const [profile, setProfile] = useState<AdminProfileData>(() => ({
    fullName: user?.fullName || 'Demo Dispatcher',
    phoneNumber: '+94 77 345 6789',
    email: user?.email || 'dispatcher@swiftdrop.local',
    role: user ? formatUserRole(user.role) : 'Dispatcher',
    initials: user ? getUserInitials(user.fullName) : 'DD',
  }))

  // Profile Avatar State (persisted to localStorage)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    return localStorage.getItem('swiftdrop_admin_avatar') || null
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 2. Regional Preferences State
  const [regional, setRegional] = useState<RegionalPreferencesData>(() => {
    const saved = localStorage.getItem('swiftdrop_admin_regional')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        // ignore
      }
    }
    return {
      language: 'English',
      timeZone: 'Asia/Colombo (UTC+05:30)',
    }
  })

  // 3. Notification Toggles State (persisted to localStorage)
  const [notifications, setNotifications] = useState<NotificationPreferencesData>(() => {
    const saved = localStorage.getItem('swiftdrop_admin_notifications')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        // ignore
      }
    }
    return {
      newUnassignedParcels: true,
      failedDeliveryAttempts: true,
      newMerchantOrCourierApplications: true,
      soundAlerts: false,
    }
  })

  // Security States
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean>(() => {
    return localStorage.getItem('swiftdrop_admin_2fa') === 'true'
  })

  // Modals state
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [is2FaModalOpen, setIs2FaModalOpen] = useState(false)
  const [isDevicesModalOpen, setIsDevicesModalOpen] = useState(false)

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // Toast / Feedback State
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const showFeedback = (message: string) => {
    setFeedbackMessage(message)
    setTimeout(() => setFeedbackMessage(null), 3500)
  }

  // Devices state
  const [hasOtherDevices, setHasOtherDevices] = useState(true)

  const handleSignOutOtherDevices = () => {
    setHasOtherDevices(false)
    showFeedback('All other device sessions have been revoked.')
  }

  const handleSignOutAllSessions = async () => {
    setIsDevicesModalOpen(false)
    showFeedback('Signing out of all sessions...')
    try {
      await logout()
    } catch {
      window.location.href = '/login'
    }
  }

  // Handle Photo Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showFeedback('Please select a valid image file.')
      return
    }

    if (file.size > 3 * 1024 * 1024) {
      showFeedback('Image file size must be under 3 MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setAvatarUrl(dataUrl)
      try {
        localStorage.setItem('swiftdrop_admin_avatar', dataUrl)
      } catch {
        // Storage limit fallback
      }
      showFeedback('Profile photo updated successfully.')
    }
    reader.readAsDataURL(file)
  }

  const handleRemovePhoto = () => {
    setAvatarUrl(null)
    localStorage.removeItem('swiftdrop_admin_avatar')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    showFeedback('Profile photo removed.')
  }

  // Handle Profile Save
  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    showFeedback('Profile information saved successfully.')
  }

  // Handle Regional Preferences Save
  const handleRegionalSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    localStorage.setItem('swiftdrop_admin_regional', JSON.stringify(regional))
    showFeedback('Regional preferences updated.')
  }

  // Toggle Notification handler (with auto-save)
  const handleToggleNotification = (key: keyof NotificationPreferencesData) => {
    setNotifications((prev) => {
      const updated = { ...prev, [key]: !prev[key] }
      localStorage.setItem('swiftdrop_admin_notifications', JSON.stringify(updated))
      return updated
    })
    showFeedback('Notification preferences updated automatically.')
  }

  // Handle Password Submit
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)

    if (!currentPassword) {
      setPasswordError('Please enter your current password.')
      return
    }

    if (newPassword.length < 12) {
      setPasswordError('New password must be at least 12 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    // Success simulation
    setIsPasswordModalOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    showFeedback('Your password has been changed successfully.')
  }

  // Handle 2FA Toggle
  const handleToggle2Fa = () => {
    const nextState = !twoFactorEnabled
    setTwoFactorEnabled(nextState)
    localStorage.setItem('swiftdrop_admin_2fa', nextState ? 'true' : 'false')
    setIs2FaModalOpen(false)
    showFeedback(
      nextState
        ? 'Two-step verification has been enabled.'
        : 'Two-step verification has been disabled.',
    )
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>{feedbackMessage}</span>
          </div>
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
              <div className={styles.avatarLarge} aria-hidden="true" style={{ overflow: 'hidden' }}>
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={profile.fullName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  profile.initials
                )}
              </div>
              <div className={styles.profileActions}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handlePhotoUpload}
                />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={styles.buttonOutlineSmall}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change photo
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      className={styles.buttonOutlineSmall}
                      style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                      onClick={handleRemovePhoto}
                      title="Remove custom photo"
                    >
                      <Trash2 size={13} style={{ marginRight: '4px' }} />
                      Remove
                    </button>
                  )}
                </div>
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
                    onClick={() => showFeedback('A verification email has been sent to update your address.')}
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
                    <Lock size={18} />
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
                  onClick={() => {
                    setPasswordError(null)
                    setIsPasswordModalOpen(true)
                  }}
                >
                  Change password
                </button>
              </div>

              {/* Two-step verification Item */}
              <div className={styles.securityItem}>
                <div className={styles.securityLeft}>
                  <div className={styles.securityIconWrapper} aria-hidden="true">
                    <Shield size={18} />
                  </div>
                  <div>
                    <h3 className={styles.securityTitle}>Two-step verification</h3>
                    <p className={styles.securityDescription}>
                      Add an extra layer of security to your account.
                    </p>
                  </div>
                </div>
                <div className={styles.securityRight}>
                  <span
                    className={styles.statusPill}
                    style={
                      twoFactorEnabled
                        ? { backgroundColor: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }
                        : {}
                    }
                  >
                    {twoFactorEnabled ? 'On' : 'Off'}
                  </span>
                  <button
                    type="button"
                    className={styles.buttonOutlineSmall}
                    onClick={() => setIs2FaModalOpen(true)}
                  >
                    {twoFactorEnabled ? 'Manage' : 'Set up'}
                  </button>
                </div>
              </div>

              {/* Signed-in devices Item */}
              <div className={styles.securityItem}>
                <div className={styles.securityLeft}>
                  <div className={styles.securityIconWrapper} aria-hidden="true">
                    <Laptop size={18} />
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
                  onClick={() => setIsDevicesModalOpen(true)}
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

      {/* Change Password Modal */}
      {isPasswordModalOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="change-password-title">
          <div className={styles.modalDialog}>
            <div className={styles.modalHeader}>
              <h2 id="change-password-title" className={styles.modalTitle}>Change password</h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIsPasswordModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handlePasswordSubmit}>
              <div className={styles.modalBody}>
                {passwordError && (
                  <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px' }}>
                    {passwordError}
                  </div>
                )}
                <div className={styles.formGroup}>
                  <label htmlFor="current-password" className={styles.label}>Current password</label>
                  <input
                    id="current-password"
                    type="password"
                    className={styles.input}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="new-password" className={styles.label}>New password (min 12 characters)</label>
                  <input
                    id="new-password"
                    type="password"
                    className={styles.input}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="confirm-new-password" className={styles.label}>Confirm new password</label>
                  <input
                    id="confirm-new-password"
                    type="password"
                    className={styles.input}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => setIsPasswordModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.buttonPrimary}>
                  Update password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Two-Step Verification Modal */}
      {is2FaModalOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="two-fa-title">
          <div className={styles.modalDialog}>
            <div className={styles.modalHeader}>
              <h2 id="two-fa-title" className={styles.modalTitle}>Two-step verification</h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIs2FaModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.5', margin: '0 0 16px 0' }}>
                Two-step verification adds an additional layer of security by requiring a verification code when signing in from an unrecognized device.
              </p>
              <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>
                    Authentication status
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                    {twoFactorEnabled ? 'Enabled on your account' : 'Currently disabled'}
                  </div>
                </div>
                <button
                  type="button"
                  className={twoFactorEnabled ? styles.buttonSecondary : styles.buttonPrimary}
                  onClick={handleToggle2Fa}
                >
                  {twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                </button>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => setIs2FaModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signed-in Devices Modal */}
      {isDevicesModalOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="devices-title">
          <div className={styles.modalDialog}>
            <div className={styles.modalHeader}>
              <h2 id="devices-title" className={styles.modalTitle}>Signed-in devices</h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIsDevicesModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 14px 0' }}>
                These devices are currently logged into your administrator account.
              </p>

              {/* Current Device */}
              <div className={styles.deviceItem}>
                <div className={styles.deviceInfo}>
                  <div className={styles.deviceIcon}>
                    <Laptop size={20} />
                  </div>
                  <div>
                    <p className={styles.deviceName}>MacBook Pro • Chrome</p>
                    <p className={styles.deviceMeta}>
                      <span className={styles.activeDot} />
                      Active now • Colombo, LK (127.0.0.1)
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>This device</span>
                  <button
                    type="button"
                    className={styles.buttonOutlineSmall}
                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                    onClick={handleSignOutAllSessions}
                    title="Sign out of this session"
                  >
                    Sign out
                  </button>
                </div>
              </div>

              {/* Other Device */}
              {hasOtherDevices ? (
                <div className={styles.deviceItem}>
                  <div className={styles.deviceInfo}>
                    <div className={styles.deviceIcon}>
                      <Laptop size={20} />
                    </div>
                    <div>
                      <p className={styles.deviceName}>Safari on iPhone</p>
                      <p className={styles.deviceMeta}>Last active 2 hours ago • Sri Lanka</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.buttonOutlineSmall}
                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                    onClick={() => {
                      setHasOtherDevices(false)
                      showFeedback('Session revoked for Safari on iPhone.')
                    }}
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic', margin: '8px 0' }}>
                  No other active device sessions.
                </p>
              )}
            </div>
            <div className={styles.modalFooter}>
              {hasOtherDevices && (
                <button
                  type="button"
                  className={styles.buttonOutlineSmall}
                  onClick={handleSignOutOtherDevices}
                >
                  Sign out other sessions
                </button>
              )}
              <button
                type="button"
                className={styles.buttonOutlineSmall}
                style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                onClick={handleSignOutAllSessions}
              >
                Sign out all sessions
              </button>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={() => setIsDevicesModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
