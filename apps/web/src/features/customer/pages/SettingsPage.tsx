import React, { useState } from 'react'
import { Lock, CheckCircle, AlertCircle, X, Eye, EyeOff } from 'lucide-react'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { useCustomerProfile } from '../context/useCustomerProfile'
import './SettingsPage.css'

interface UserProfileState {
  fullName: string
  email: string
  phoneNumber: string
}

interface NotificationPreferencesState {
  isEmailUpdatesEnabled: boolean
  isSmsUpdatesEnabled: boolean
}

interface ValidationErrors {
  fullName?: string
  email?: string
  phoneNumber?: string
}

/**
 * Customer Settings page for managing profile details, security credentials,
 * and notification preferences. Adheres to SOLID, DRY, and explicit naming standards.
 */
export const SettingsPage: React.FC = () => {
  const { profile: customerProfile, updateProfile } = useCustomerProfile()

  // State management initialized from shared customer profile context
  const [profile, setProfile] = useState<UserProfileState>({
    fullName: customerProfile.fullName,
    email: customerProfile.email,
    phoneNumber: customerProfile.phoneNumber,
  })
  const [persistedProfile, setPersistedProfile] = useState<UserProfileState>({
    fullName: customerProfile.fullName,
    email: customerProfile.email,
    phoneNumber: customerProfile.phoneNumber,
  })
  const [notifications, setNotifications] = useState<NotificationPreferencesState>({
    isEmailUpdatesEnabled: customerProfile.notifications.isEmailUpdatesEnabled,
    isSmsUpdatesEnabled: customerProfile.notifications.isSmsUpdatesEnabled,
  })
  const [persistedNotifications, setPersistedNotifications] = useState<NotificationPreferencesState>({
    isEmailUpdatesEnabled: customerProfile.notifications.isEmailUpdatesEnabled,
    isSmsUpdatesEnabled: customerProfile.notifications.isSmsUpdatesEnabled,
  })

  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusFeedbackMessage, setStatusFeedbackMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // Password Modal State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [passwordModalError, setPasswordModalError] = useState<string | null>(null)
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false)

  // Handlers for profile field changes
  const handleProfileFieldChange = (
    field: keyof UserProfileState,
    value: string,
  ): void => {
    setProfile((previous) => ({
      ...previous,
      [field]: value,
    }))

    // Clear specific field error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors((previous) => ({
        ...previous,
        [field]: undefined,
      }))
    }
  }

  // Handlers for notification preferences
  const handleEmailNotificationToggle = (nextState: boolean): void => {
    setNotifications((previous) => ({
      ...previous,
      isEmailUpdatesEnabled: nextState,
    }))
  }

  const handleSmsNotificationToggle = (nextState: boolean): void => {
    setNotifications((previous) => ({
      ...previous,
      isSmsUpdatesEnabled: nextState,
    }))
  }

  // Input validation logic
  const validateForm = (): boolean => {
    const errors: ValidationErrors = {}
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!profile.fullName.trim()) {
      errors.fullName = 'Full name is required.'
    }

    if (!profile.email.trim()) {
      errors.email = 'Email address is required.'
    } else if (!emailRegex.test(profile.email.trim())) {
      errors.email = 'Please provide a valid email address.'
    }

    // Sri Lankan / International phone format validation (+94 or 0 followed by 9 digits)
    const phoneCleaned = profile.phoneNumber.replace(/[\s-]/g, '')
    const phoneRegex = /^(\+94|0)[0-9]{9}$/
    if (profile.phoneNumber.trim() && !phoneRegex.test(phoneCleaned)) {
      errors.phoneNumber = 'Enter a valid phone number (e.g., +94 77 123 4567 or 0771234567).'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Save changes handler
  const handleSaveChanges = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setStatusFeedbackMessage(null)

    if (!validateForm()) {
      setStatusFeedbackMessage({
        type: 'error',
        text: 'Please review and correct the errors highlighted below.',
      })
      return
    }

    try {
      setIsSubmitting(true)
      // Simulate backend API call latency
      await new Promise((resolve) => setTimeout(resolve, 600))

      // Update shared customer context so topbar and sidebar sync instantly
      updateProfile({
        fullName: profile.fullName,
        email: profile.email,
        phoneNumber: profile.phoneNumber,
        notifications: {
          isEmailUpdatesEnabled: notifications.isEmailUpdatesEnabled,
          isSmsUpdatesEnabled: notifications.isSmsUpdatesEnabled,
        },
      })

      setPersistedProfile(profile)
      setPersistedNotifications(notifications)
      setStatusFeedbackMessage({
        type: 'success',
        text: 'Your settings and preferences have been successfully updated.',
      })
    } catch {
      setStatusFeedbackMessage({
        type: 'error',
        text: 'An unexpected error occurred while saving. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Cancel handler: resets modified state back to persisted data
  const handleCancelChanges = (): void => {
    setProfile(persistedProfile)
    setNotifications(persistedNotifications)
    setValidationErrors({})
    setStatusFeedbackMessage(null)
  }

  // Password change submission handler
  const handleChangePasswordSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setPasswordModalError(null)

    if (!currentPassword) {
      setPasswordModalError('Please enter your current password.')
      return
    }

    if (newPassword.length < 8) {
      setPasswordModalError('New password must be at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordModalError('New passwords do not match.')
      return
    }

    try {
      setIsPasswordSubmitting(true)
      await new Promise((resolve) => setTimeout(resolve, 600))

      setIsPasswordModalOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setStatusFeedbackMessage({
        type: 'success',
        text: 'Your password was changed successfully.',
      })
    } catch {
      setPasswordModalError('Failed to change password. Please verify your current password.')
    } finally {
      setIsPasswordSubmitting(false)
    }
  }

  return (
    <div className="settings-container">
      {/* Page Header */}
      <header className="settings-header">
        <h1 className="settings-header__title">Settings</h1>
        <p className="settings-header__subtitle">Manage your profile and preferences.</p>
      </header>

      {/* Global Status Banner */}
      {statusFeedbackMessage && (
        <div
          role="status"
          className={`settings-feedback settings-feedback--${statusFeedbackMessage.type}`}
        >
          {statusFeedbackMessage.type === 'success' ? (
            <CheckCircle className="settings-feedback__icon" />
          ) : (
            <AlertCircle className="settings-feedback__icon" />
          )}
          <span>{statusFeedbackMessage.text}</span>
          <button
            type="button"
            className="settings-feedback__close-btn"
            onClick={() => setStatusFeedbackMessage(null)}
            aria-label="Dismiss message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Settings Card */}
      <form onSubmit={handleSaveChanges} className="settings-card" noValidate>
        {/* Section 1: Profile */}
        <section className="settings-section">
          <h2 className="settings-section__title">Profile</h2>

          <div className="settings-grid">
            <div className="settings-form-group">
              <label htmlFor="input-full-name" className="settings-label">
                Full name
              </label>
              <input
                id="input-full-name"
                type="text"
                value={profile.fullName}
                onChange={(e) => handleProfileFieldChange('fullName', e.target.value)}
                className={`settings-input ${validationErrors.fullName ? 'settings-input--error' : ''}`}
                placeholder="Your full name"
              />
              {validationErrors.fullName && (
                <span className="settings-error-text">{validationErrors.fullName}</span>
              )}
            </div>

            <div className="settings-form-group">
              <label htmlFor="input-email-address" className="settings-label">
                Email address
              </label>
              <input
                id="input-email-address"
                type="email"
                value={profile.email}
                onChange={(e) => handleProfileFieldChange('email', e.target.value)}
                className={`settings-input ${validationErrors.email ? 'settings-input--error' : ''}`}
                placeholder="name@example.com"
              />
              {validationErrors.email && (
                <span className="settings-error-text">{validationErrors.email}</span>
              )}
            </div>

            <div className="settings-form-group">
              <label htmlFor="input-phone-number" className="settings-label">
                Phone number
              </label>
              <input
                id="input-phone-number"
                type="tel"
                value={profile.phoneNumber}
                onChange={(e) => handleProfileFieldChange('phoneNumber', e.target.value)}
                className={`settings-input ${validationErrors.phoneNumber ? 'settings-input--error' : ''}`}
                placeholder="+94 77 123 4567"
              />
              {validationErrors.phoneNumber && (
                <span className="settings-error-text">{validationErrors.phoneNumber}</span>
              )}
            </div>
          </div>
        </section>

        <hr className="settings-divider" />

        {/* Section 2: Security */}
        <section className="settings-section">
          <h2 className="settings-section__title">Security</h2>
          <p className="settings-section__description">Keep your account secure.</p>

          <div className="settings-row">
            <span className="settings-row__label">Password</span>
            <button
              type="button"
              onClick={() => {
                setPasswordModalError(null)
                setIsPasswordModalOpen(true)
              }}
              className="settings-btn-secondary"
            >
              <Lock className="w-4 h-4 mr-2" />
              Change password
            </button>
          </div>
        </section>

        <hr className="settings-divider" />

        {/* Section 3: Notifications */}
        <section className="settings-section">
          <h2 className="settings-section__title">Notifications</h2>

          <div className="settings-notification-list">
            <div className="settings-notification-item">
              <div className="settings-notification-info">
                <span className="settings-notification-title">Email updates</span>
                <span className="settings-notification-description">
                  Delivery status updates by email.
                </span>
              </div>
              <ToggleSwitch
                switchIdentifier="toggle-email-notifications"
                accessibilityLabel="Enable email delivery updates"
                isChecked={notifications.isEmailUpdatesEnabled}
                onToggleChange={handleEmailNotificationToggle}
              />
            </div>

            <div className="settings-notification-item">
              <div className="settings-notification-info">
                <span className="settings-notification-title">SMS updates</span>
                <span className="settings-notification-description">
                  Delivery status updates by SMS.
                </span>
              </div>
              <ToggleSwitch
                switchIdentifier="toggle-sms-notifications"
                accessibilityLabel="Enable SMS delivery updates"
                isChecked={notifications.isSmsUpdatesEnabled}
                onToggleChange={handleSmsNotificationToggle}
              />
            </div>
          </div>
        </section>

        {/* Form Action Controls */}
        <div className="settings-actions">
          <button
            type="button"
            onClick={handleCancelChanges}
            disabled={isSubmitting}
            className="settings-actions__cancel-btn"
          >
            Cancel
          </button>
          <button
            id="save-changes-button"
            type="submit"
            disabled={isSubmitting}
            className="settings-actions__save-btn"
          >
            {isSubmitting ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>

      {/* Password Change Dialog Modal */}
      {isPasswordModalOpen && (
        <div className="settings-modal-backdrop" onClick={() => setIsPasswordModalOpen(false)}>
          <div
            className="settings-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-modal-title"
          >
            <div className="settings-modal-header">
              <h3 id="password-modal-title" className="settings-modal-title">
                Change Password
              </h3>
              <button
                type="button"
                className="settings-modal-close"
                onClick={() => setIsPasswordModalOpen(false)}
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {passwordModalError && (
              <div className="settings-feedback settings-feedback--error mb-4">
                <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>{passwordModalError}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="settings-modal-form">
              <div className="settings-form-group">
                <label htmlFor="modal-current-password" className="settings-label">
                  Current password
                </label>
                <input
                  id="modal-current-password"
                  type={showPasswords ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="settings-input"
                  placeholder="Enter current password"
                  autoFocus
                />
              </div>

              <div className="settings-form-group">
                <label htmlFor="modal-new-password" className="settings-label">
                  New password
                </label>
                <input
                  id="modal-new-password"
                  type={showPasswords ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="settings-input"
                  placeholder="At least 8 characters"
                />
              </div>

              <div className="settings-form-group">
                <label htmlFor="modal-confirm-password" className="settings-label">
                  Confirm new password
                </label>
                <input
                  id="modal-confirm-password"
                  type={showPasswords ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="settings-input"
                  placeholder="Re-enter new password"
                />
              </div>

              <div className="settings-modal-toggle-row">
                <button
                  type="button"
                  onClick={() => setShowPasswords((prev) => !prev)}
                  className="settings-modal-toggle-btn"
                >
                  {showPasswords ? (
                    <EyeOff className="w-4 h-4 mr-1.5" />
                  ) : (
                    <Eye className="w-4 h-4 mr-1.5" />
                  )}
                  <span>{showPasswords ? 'Hide passwords' : 'Show passwords'}</span>
                </button>
              </div>

              <div className="settings-modal-actions">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="settings-actions__cancel-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPasswordSubmitting}
                  className="settings-actions__save-btn"
                >
                  {isPasswordSubmitting ? 'Updating...' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default SettingsPage
