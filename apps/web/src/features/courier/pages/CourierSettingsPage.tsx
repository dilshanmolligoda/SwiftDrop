import { useState, type ReactNode } from 'react'
import {
  Bell,
  CheckCircle2,
  Info,
  KeyRound,
  Link2,
  LogOut,
  Palette,
  ShieldCheck,
  Sun,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useSession, type SessionUser } from '../../../app/auth/session'
import { env } from '../../../lib/env'
import { formatDateTime, getInitials } from '../utils/format'
import './CourierPages.css'
import './CourierSettingsPage.css'

const APPROVAL_LABELS: Record<SessionUser['approvalStatus'], string> = {
  APPROVED: 'Approved',
  PENDING: 'Pending review',
  REJECTED: 'Rejected',
}

const APP_VERSION: string | undefined = import.meta.env.VITE_APP_VERSION

interface SettingsSectionProps {
  readonly id: string
  readonly icon: LucideIcon
  readonly title: string
  readonly description: string
  readonly children: ReactNode
}

function SettingsSection({ id, icon: Icon, title, description, children }: SettingsSectionProps) {
  return (
    <section className="cp-card cp-settings__section" aria-labelledby={`${id}-title`}>
      <header className="cp-card__header">
        <div>
          <h2 id={`${id}-title`} className="cp-card__title">
            <Icon aria-hidden="true" />
            {title}
          </h2>
          <p className="cp-card__subtitle">{description}</p>
        </div>
      </header>
      <div className="cp-card__body">{children}</div>
    </section>
  )
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="cp-settings__row">
      <dt className="cp-settings__label">{label}</dt>
      <dd className="cp-settings__value">{children}</dd>
    </div>
  )
}

/** Shown where the backend has no endpoint yet, so nothing pretends to save. */
function UnavailableNote({ children }: { readonly children: ReactNode }) {
  return (
    <p className="cp-settings__note">
      <Info aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

/**
 * Courier account settings. Everything shown comes from the authenticated
 * session (`GET /auth/me`); features without a backend endpoint are labelled
 * as unavailable instead of offering controls that would not persist.
 */
export function CourierSettingsPage() {
  const { user, signOut } = useSession()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = async () => {
    setIsSigningOut(true)
    await signOut()
  }

  return (
    <div className="cp-page cp-settings">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-header__title">Settings</h1>
          <p className="cp-page-header__subtitle">Your courier account, security and portal information</p>
        </div>
      </header>

      <SettingsSection
        id="settings-profile"
        icon={UserRound}
        title="Profile"
        description="Details from your SwiftDrop courier account."
      >
        <div className="cp-settings__identity">
          <span className="cp-avatar cp-settings__avatar" aria-hidden="true">
            {getInitials(user.fullName)}
          </span>
          <div className="cp-settings__identity-text">
            <p className="cp-settings__name">{user.fullName}</p>
            <p className="cp-settings__email">{user.email}</p>
          </div>
        </div>
        <dl className="cp-settings__list">
          <DetailRow label="Role">Courier</DetailRow>
          <DetailRow label="Approval status">
            <span className={`cp-settings__pill cp-settings__pill--${user.approvalStatus.toLowerCase()}`}>
              {user.approvalStatus === 'APPROVED' && <CheckCircle2 aria-hidden="true" />}
              {APPROVAL_LABELS[user.approvalStatus]}
            </span>
          </DetailRow>
          <DetailRow label="Account">{user.isActive ? 'Active' : 'Inactive'}</DetailRow>
          <DetailRow label="Member since">{formatDateTime(user.createdAt)}</DetailRow>
        </dl>
        <UnavailableNote>
          Editing your name, email or contact details is not available in the courier portal yet.
        </UnavailableNote>
      </SettingsSection>

      <SettingsSection
        id="settings-security"
        icon={ShieldCheck}
        title="Account and security"
        description="How you sign in to SwiftDrop."
      >
        <dl className="cp-settings__list">
          <DetailRow label="Sign-in email">{user.email}</DetailRow>
          <DetailRow label="Google account">
            {user.isGoogleLinked ? (
              <span className="cp-settings__pill cp-settings__pill--approved">
                <CheckCircle2 aria-hidden="true" />
                Connected
              </span>
            ) : (
              <span className="cp-settings__inline">
                <span className="cp-settings__muted">Not connected</span>
                <a className="cp-btn cp-btn--soft cp-btn--sm" href={`${env.apiBaseUrl}/auth/google/link`}>
                  <Link2 aria-hidden="true" />
                  Connect Google
                </a>
              </span>
            )}
          </DetailRow>
          <DetailRow label="Password">
            <span className="cp-settings__inline">
              <KeyRound aria-hidden="true" className="cp-settings__inline-icon" />
              <span className="cp-settings__muted">Password changes are not available in the portal yet.</span>
            </span>
          </DetailRow>
        </dl>
        <div className="cp-settings__actions">
          <button
            type="button"
            className="cp-btn cp-btn--ghost"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
          >
            <LogOut aria-hidden="true" />
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        id="settings-notifications"
        icon={Bell}
        title="Notifications"
        description="Delivery assignment and status alerts."
      >
        <UnavailableNote>
          Notification preferences are not available yet. New assignments and status changes appear on your
          dashboard and in My deliveries.
        </UnavailableNote>
      </SettingsSection>

      <SettingsSection
        id="settings-appearance"
        icon={Palette}
        title="Appearance"
        description="How the courier portal looks."
      >
        <dl className="cp-settings__list">
          <DetailRow label="Theme">
            <span className="cp-settings__inline">
              <Sun aria-hidden="true" className="cp-settings__inline-icon" />
              Light
            </span>
          </DetailRow>
        </dl>
        <UnavailableNote>SwiftDrop currently offers a light theme only; dark mode is not available yet.</UnavailableNote>
      </SettingsSection>

      <SettingsSection
        id="settings-about"
        icon={Info}
        title="Application"
        description="About this portal."
      >
        <dl className="cp-settings__list">
          <DetailRow label="Application">SwiftDrop</DetailRow>
          <DetailRow label="Portal">Courier Portal</DetailRow>
          <DetailRow label="Version">{APP_VERSION ?? 'Development build'}</DetailRow>
          <DetailRow label="Delivery day">Asia/Colombo time</DetailRow>
        </dl>
      </SettingsSection>
    </div>
  )
}
