import { useEffect, useState } from 'react'
import {
  BadgeCheck,
  Bell,
  Building2,
  LockKeyhole,
  Settings2,
  UserRound,
  X,
  Eye,
  EyeOff,
  ExternalLink,
} from 'lucide-react'
import styles from './MerchantSettingsPage.module.css'
import { apiRequest } from '../../../api/client'

interface ContactDetails {
  fullName: string
  phoneNumber: string
  emailAddress: string
}

interface MerchantSettingsResponse {
  businessProfile: {
    businessName: string
    registrationNumber: string | null
    businessAddress: string
    website: string | null
    businessType: string
    approved: boolean
  }
  contactDetails: {
    fullName: string
    phoneNumber: string | null
    emailAddress: string
  }
  security: {
    twoFactorEnabled: boolean
  }
  notifications: {
    deliveryStatusUpdates: boolean
    failedDeliveries: boolean
    storeConnectionIssues: boolean
  }
  preferences: {
    language: string
    timeZone: string
  }
}

export default function MerchantSettingsPage() {
  const [businessProfile, setBusinessProfile] = useState<MerchantSettingsResponse['businessProfile'] | null>(null)
  const [contactDetails, setContactDetails] = useState<ContactDetails>({
    fullName: 'Saman Perera',
    phoneNumber: '+94 77 456 7890',
    emailAddress: 'saman@greenleaf.example',
  })
  const [savedContactDetails, setSavedContactDetails] = useState(contactDetails)
  const [emailAddressValue, setEmailAddressValue] = useState(contactDetails.emailAddress)
  const [savedEmailAddress, setSavedEmailAddress] = useState(contactDetails.emailAddress)
  const [deliveryStatusUpdates, setDeliveryStatusUpdates] = useState(true)
  const [failedDeliveries, setFailedDeliveries] = useState(true)
  const [storeConnectionIssues, setStoreConnectionIssues] = useState(true)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [language, setLanguage] = useState('English')
  const [timeZone, setTimeZone] = useState('Asia/Colombo (UTC+05:30)')
  const [toast, setToast] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void apiRequest<MerchantSettingsResponse>('/merchant/settings', { signal: controller.signal })
      .then((settings) => {
        setBusinessProfile(settings.businessProfile)
        const contact = {
          fullName: settings.contactDetails.fullName,
          phoneNumber: settings.contactDetails.phoneNumber ?? '',
          emailAddress: settings.contactDetails.emailAddress,
        }
        setContactDetails(contact)
        setSavedContactDetails(contact)
        setEmailAddressValue(contact.emailAddress)
        setSavedEmailAddress(contact.emailAddress)
        setTwoFactorEnabled(settings.security.twoFactorEnabled)
        setDeliveryStatusUpdates(settings.notifications.deliveryStatusUpdates)
        setFailedDeliveries(settings.notifications.failedDeliveries)
        setStoreConnectionIssues(settings.notifications.storeConnectionIssues)
        setLanguage(settings.preferences.language)
        setTimeZone(settings.preferences.timeZone)
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to load merchant settings')
      })
    return () => controller.abort()
  }, [])

  const updateContact = (field: keyof ContactDetails, value: string) => {
    setContactDetails((current) => ({ ...current, [field]: value }))
  }

  const saveContactDetails = async () => {
    try {
      const saved = await apiRequest<ContactDetails>('/merchant/settings/contact', {
        method: 'PATCH',
        body: {
          fullName: contactDetails.fullName,
          phoneNumber: contactDetails.phoneNumber,
          email: emailAddressValue,
        },
      })
      setContactDetails(saved)
      setSavedContactDetails(saved)
      setEmailAddressValue(saved.emailAddress)
      setSavedEmailAddress(saved.emailAddress)
      setToast('Contact details saved')
    } catch (error: unknown) {
      setToast(error instanceof Error ? error.message : 'Unable to save contact details')
    }
  }

  const changeEmailAddress = () => {
    void saveContactDetails()
  }

  const savePreferences = async () => {
    try {
      await apiRequest('/merchant/settings/preferences', {
        method: 'PATCH',
        body: { language, timeZone },
      })
      setToast('Preferences saved')
    } catch (error: unknown) {
      setToast(error instanceof Error ? error.message : 'Unable to save preferences')
    }
  }

  const saveNotificationPreferences = async (
    deliveryStatusUpdates: boolean,
    failedDeliveries: boolean,
    storeConnectionIssues: boolean,
  ) => {
    try {
      await apiRequest('/merchant/settings/notifications', {
        method: 'PATCH',
        body: {
          deliveryStatusUpdates,
          failedDeliveries,
          storeConnectionIssues,
        },
      })
    } catch (error: unknown) {
      setToast(error instanceof Error ? error.message : 'Unable to save notification preferences')
    }
  }

  const submitPasswordChange = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get('currentPassword') ?? '')
    const newPassword = String(form.get('newPassword') ?? '')
    const confirmPassword = String(form.get('confirmPassword') ?? '')

    if (!currentPassword) {
      setPasswordError('Please enter your current password.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    void apiRequest<{ message: string }>('/merchant/settings/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }).then((response) => {
      setPasswordError(null)
      setIsPasswordModalOpen(false)
      setToast(response.message)
    }).catch((error: unknown) => {
      setPasswordError(error instanceof Error ? error.message : 'Unable to change password')
    })
  }

  const closePasswordModal = () => {
    setPasswordError(null)
    setIsPasswordModalOpen(false)
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>Settings</h1>
        <p>Manage your business profile, account and preferences.</p>
      </header>

      {loadError && <div className={styles.passwordError} role="alert">{loadError}</div>}

      <div className={styles.settingsGrid}>
        <div className={styles.primaryColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <span className={styles.sectionIcon}><Building2 size={16} /></span>
                <h2>Business profile</h2>
              </div>
              <span className={styles.approved}><BadgeCheck size={12} />Approved</span>
            </div>

            <dl className={styles.businessDetails}>
              <div><dt>Registered business name</dt><dd>{businessProfile?.businessName ?? '—'}</dd></div>
              <div><dt>Registration number</dt><dd>{businessProfile?.registrationNumber ?? 'Not provided'}</dd></div>
              <div><dt>Business address</dt><dd>{businessProfile?.businessAddress ?? '—'}</dd></div>
              <div><dt>Website</dt><dd>{businessProfile?.website ?? 'Not provided'}</dd></div>
            </dl>

            <button type="button" className={styles.inlineLink} onClick={() => void apiRequest<{ approved: boolean; documents: unknown[] }>('/merchant/settings/verification-documents').then((result) => setToast(result.documents.length ? 'Verification documents loaded' : 'No verification documents uploaded')).catch((error: unknown) => setToast(error instanceof Error ? error.message : 'Unable to load verification documents'))}>
              View verification documents <ExternalLink size={11} />
            </button>
            <p className={styles.helpText}>Changes to verified business details require review.</p>
            <button type="button" className={styles.outlineButton} onClick={() => void apiRequest('/merchant/settings/business-update', {
              method: 'POST',
              body: {
                businessName: businessProfile?.businessName,
                businessAddress: businessProfile?.businessAddress,
                businessType: businessProfile?.businessType,
                registrationNumber: businessProfile?.registrationNumber,
                website: businessProfile?.website,
              },
            }).then(() => setToast('Business update request submitted')).catch((error: unknown) => setToast(error instanceof Error ? error.message : 'Unable to submit business update'))}>
              Request business update
            </button>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <span className={styles.sectionIcon}><UserRound size={16} /></span>
                <h2>Contact details</h2>
              </div>
            </div>
            <p className={styles.cardDescription}>Used for delivery and account communication.</p>

            <div className={styles.contactFields}>
              <label>
                <span>Full name</span>
                <input value={contactDetails.fullName} onChange={(event) => updateContact('fullName', event.target.value)} />
              </label>
              <label>
                <span>Phone number</span>
                <input value={contactDetails.phoneNumber} onChange={(event) => updateContact('phoneNumber', event.target.value)} />
              </label>
              <label className={styles.emailRow}>
                <span>Email address</span>
                <div className={styles.inputWithAction}>
                  <input value={emailAddressValue} onChange={(event) => setEmailAddressValue(event.target.value)} />
                  <button type="button" onClick={changeEmailAddress} disabled={emailAddressValue === savedEmailAddress}>Change</button>
                </div>
              </label>
            </div>
            <div className={styles.cardActions}>
              <button type="button" className={styles.primaryButton} onClick={saveContactDetails} disabled={JSON.stringify(contactDetails) === JSON.stringify(savedContactDetails)}>
                Save contact details
              </button>
            </div>
          </section>
        </div>

        <div className={styles.secondaryColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <span className={styles.sectionIcon}><LockKeyhole size={16} /></span>
                <h2>Security</h2>
              </div>
            </div>

            <div className={styles.settingRows}>
              <div className={styles.settingRow}>
                <span>Password</span>
                <button type="button" className={styles.outlineButtonCompact} onClick={() => setIsPasswordModalOpen(true)}>Change password</button>
              </div>
              <div className={styles.settingRow}>
                <span>Two-step verification</span>
                <div className={styles.inlineStatus}>
                  <span className={twoFactorEnabled ? styles.statusOn : styles.statusOff}>{twoFactorEnabled ? 'On' : 'Off'}</span>
                  <button type="button" className={styles.inlineButton} onClick={() => {
                    const enabled = !twoFactorEnabled
                    void apiRequest<{ twoFactorEnabled: boolean; message: string }>('/merchant/settings/two-factor', {
                      method: 'PATCH',
                      body: { enabled },
                    }).then((response) => {
                      setTwoFactorEnabled(response.twoFactorEnabled)
                      setToast(response.message)
                    }).catch((error: unknown) => setToast(error instanceof Error ? error.message : 'Unable to update two-step verification'))
                  }}>{twoFactorEnabled ? 'Turn off' : 'Set up'}</button>
                </div>
              </div>
              <div className={styles.settingRow}>
                <span>Signed-in devices</span>
                <button type="button" className={styles.inlineButton} onClick={() => setToast('Signed-in devices opened')}>Manage <span aria-hidden="true">→</span></button>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <span className={styles.sectionIcon}><Bell size={16} /></span>
                <h2>Notifications</h2>
              </div>
            </div>
            <p className={styles.cardDescription}>Email alerts for your business.</p>
            <div className={styles.settingRows}>
              <ToggleRow label="Delivery status updates" checked={deliveryStatusUpdates} onChange={(checked) => {
                setDeliveryStatusUpdates(checked)
                void saveNotificationPreferences(checked, failedDeliveries, storeConnectionIssues)
              }} />
              <ToggleRow label="Failed deliveries" checked={failedDeliveries} onChange={(checked) => {
                setFailedDeliveries(checked)
                void saveNotificationPreferences(deliveryStatusUpdates, checked, storeConnectionIssues)
              }} />
              <ToggleRow label="Store connection issues" checked={storeConnectionIssues} onChange={(checked) => {
                setStoreConnectionIssues(checked)
                void saveNotificationPreferences(deliveryStatusUpdates, failedDeliveries, checked)
              }} />
              <div className={styles.settingRow}>
                <span>Preferences</span>
                <span className={styles.statusOff}>CSV, automatically</span>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <span className={styles.sectionIcon}><Settings2 size={16} /></span>
                <h2>Preferences</h2>
              </div>
            </div>

            <div className={styles.preferenceGrid}>
              <label>
                <span>Language</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option>English</option>
                  <option>Sinhala</option>
                  <option>Tamil</option>
                </select>
              </label>
              <label>
                <span>Time zone</span>
                <select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>
                  <option>Asia/Colombo (UTC+05:30)</option>
                  <option>UTC (UTC+00:00)</option>
                </select>
              </label>
            </div>
            <div className={styles.cardActions}>
              <button type="button" className={styles.outlineButtonCompact} onClick={savePreferences}>Save preferences</button>
            </div>
          </section>
        </div>
      </div>

      {isPasswordModalOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={closePasswordModal}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="password-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 id="password-title">Change password</h2>
              <button type="button" aria-label="Close" onClick={closePasswordModal}><X size={18} /></button>
            </div>
            <form onSubmit={submitPasswordChange} className={styles.passwordForm}>
              {passwordError && <p className={styles.passwordError} role="alert">{passwordError}</p>}
              <label><span>Current password</span><div><input name="currentPassword" type={showPasswords ? 'text' : 'password'} /><EyeButton show={showPasswords} onClick={() => setShowPasswords((show) => !show)} /></div></label>
              <label><span>New password</span><div><input name="newPassword" type={showPasswords ? 'text' : 'password'} /></div></label>
              <label><span>Confirm new password</span><div><input name="confirmPassword" type={showPasswords ? 'text' : 'password'} /></div></label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelButton} onClick={closePasswordModal}>Cancel</button>
                <button type="submit" className={styles.primaryButton}>Update password</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast} role="status">{toast}<button type="button" aria-label="Dismiss" onClick={() => setToast(null)}><X size={13} /></button></div>}
    </div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="merchant-setting-row">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className={checked ? 'merchant-toggle merchant-toggleOn' : 'merchant-toggle'} onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  )
}

function EyeButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  return <button type="button" className="password-eye" aria-label={show ? 'Hide passwords' : 'Show passwords'} onClick={onClick}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
}
