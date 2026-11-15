import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Check, Circle, Package, Search, Truck, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { env } from '../../../lib/env'
import './CustomerTrackingPage.css'

type SessionState = 'checking' | 'customer' | 'redirecting' | 'error' | 'denied'
type TrackingStage = 'CREATED' | 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'

// View model for a future customer-scoped tracking API; no sample records are loaded.
interface TrackingParcel {
  trackingNumber: string
  status: TrackingStage
  origin?: string
  destination?: string
  updatedAt?: string
  history: readonly { stage: TrackingStage; timestamp?: string }[]
}

const TIMELINE_STAGES: readonly { stage: TrackingStage; label: string }[] = [
  { stage: 'CREATED', label: 'Created' },
  { stage: 'PICKED_UP', label: 'Picked Up' },
  { stage: 'IN_TRANSIT', label: 'In Transit' },
  { stage: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { stage: 'DELIVERED', label: 'Delivered' },
]

function formatTimestamp(value?: string): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Colombo',
  }).format(new Date(value))
}

function TrackingTimeline({ parcel }: { parcel: TrackingParcel | null }) {
  const failed = parcel?.status === 'FAILED'
  const stages = failed
    ? [...TIMELINE_STAGES.filter(({ stage }) => stage !== 'DELIVERED'), { stage: 'FAILED' as const, label: 'Failed' }]
    : TIMELINE_STAGES

  return (
    <ol className="customer-tracking-timeline" aria-label="Delivery progress">
      {stages.map(({ stage, label }) => {
        const event = parcel?.history.find((item) => item.stage === stage)
        const current = parcel?.status === stage
        // A current status does not prove when, or whether, earlier stages occurred.
        const completed = Boolean(event) && !current
        const state = current ? (failed ? 'failed' : 'current') : completed ? 'completed' : 'pending'
        const timestamp = formatTimestamp(event?.timestamp)
        const Icon = current && failed ? X : completed ? Check : Circle

        return (
          <li
            key={stage}
            className={`customer-tracking-step customer-tracking-step--${state}`}
            aria-current={current ? 'step' : undefined}
          >
            <span className="customer-tracking-step-marker" aria-hidden="true">
              <Icon size={12} strokeWidth={3} />
            </span>
            <div>
              <p className="customer-tracking-step-label">{label}</p>
              <p className="customer-tracking-step-description">
                {current ? (failed ? 'Delivery failed' : 'Current status') : completed ? 'Confirmed in status history' : parcel ? 'Not yet confirmed' : 'Awaiting tracking data'}
              </p>
              {timestamp && (
                <time className="customer-tracking-step-time" dateTime={event?.timestamp}>
                  {timestamp} (Sri Lanka time)
                </time>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function ParcelDetails({ parcel }: { parcel: TrackingParcel | null }) {
  const updatedAt = formatTimestamp(parcel?.updatedAt)

  return (
    <section className="customer-tracking-details" aria-labelledby="customer-tracking-details-title">
      <div className="customer-tracking-details-header">
        <div>
          <h2 id="customer-tracking-details-title" className="customer-tracking-section-title">
            {parcel?.trackingNumber ?? 'Delivery progress'}
          </h2>
          {parcel?.origin && parcel.destination && (
            <p className="customer-tracking-route">{parcel.origin} to {parcel.destination}</p>
          )}
          {updatedAt && (
            <p className="customer-tracking-updated">
              Last updated: <time dateTime={parcel?.updatedAt}>{updatedAt} (Sri Lanka time)</time>
            </p>
          )}
        </div>
        <span className={`customer-tracking-badge${parcel?.status === 'FAILED' ? ' customer-tracking-badge--failed' : ''}`}>
          {parcel ? [...TIMELINE_STAGES, { stage: 'FAILED', label: 'Failed' }].find(({ stage }) => stage === parcel.status)?.label : 'No tracking data'}
        </span>
      </div>
      {!parcel && (
        <p className="customer-tracking-timeline-note">
          Confirmed parcel details and timestamps will appear here once tracking is connected.
          No delivery stage has been confirmed.
        </p>
      )}
      <TrackingTimeline parcel={parcel} />
    </section>
  )
}

export function CustomerTrackingPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionState>('checking')
  const [sessionError, setSessionError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [submittedNumber, setSubmittedNumber] = useState('')
  const [inputError, setInputError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    const verifyCustomer = async () => {
      try {
        const response = await fetch(`${env.apiBaseUrl}/auth/me`, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
        })
        if (controller.signal.aborted) return

        if (response.status === 401) {
          setSession('redirecting')
          navigate('/login', { replace: true })
          return
        }
        if (response.status === 403) {
          setSession('denied')
          return
        }
        if (!response.ok) throw new Error('Session request failed')

        const user: unknown = await response.json()
        if (controller.signal.aborted) return
        if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string' || !user.id || !('role' in user) || !('approvalStatus' in user)) {
          throw new Error('Invalid session response')
        }

        if (user.approvalStatus === 'PENDING' || user.approvalStatus === 'REJECTED') {
          setSession('redirecting')
          navigate('/application-status', { replace: true })
          return
        }
        if (user.approvalStatus !== 'APPROVED') throw new Error('Unverified approval status')

        if (user.role !== 'CUSTOMER') {
          const destination = user.role === 'MERCHANT' ? '/merchant/dashboard'
            : user.role === 'COURIER' ? '/courier/dashboard'
              : user.role === 'ADMIN' || user.role === 'DISPATCHER' ? '/admin' : null
          setSession(destination ? 'redirecting' : 'denied')
          if (destination) navigate(destination, { replace: true })
          return
        }

        setSession('customer')
      } catch {
        if (controller.signal.aborted) return
        setSessionError('Unable to verify your customer session. Please check your connection and try again.')
        setSession('error')
      }
    }

    void verifyCustomer()
    return () => controller.abort()
  }, [navigate, attempt])

  if (session === 'checking' || session === 'redirecting') {
    return <div className="customer-tracking-session" role="status">Verifying customer access…</div>
  }

  if (session === 'error' || session === 'denied') {
    return (
      <section className="customer-tracking-session" aria-labelledby="customer-tracking-access-title">
        <h1 id="customer-tracking-access-title" className="customer-tracking-title">
          {session === 'denied' ? 'Customer access required' : 'Unable to load tracking'}
        </h1>
        <p role="alert">{session === 'denied' ? 'This page is only available to approved customer accounts.' : sessionError}</p>
        <div className="customer-tracking-session-actions">
          {session === 'error' && (
            <button className="customer-tracking-button" type="button" onClick={() => {
              setSession('checking')
              setSessionError('')
              setAttempt((value) => value + 1)
            }}>Try again</button>
          )}
          <Link className="customer-tracking-link" to="/login">Go to login</Link>
        </div>
      </section>
    )
  }

  const handleTrack = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = trackingNumber.trim().toUpperCase()
    setTrackingNumber(normalized)
    setSubmittedNumber('')
    setInputError(normalized ? '' : 'Please enter a tracking number.')
    if (normalized) setSubmittedNumber(normalized)
  }

  // Existing delivery storage is browser-wide, not account-scoped, and has no
  // status history. Do not expose it as authenticated customer tracking data.
  // Integrate a customer-authorized API here before populating metrics or parcel.
  return (
    <div className="customer-tracking-page">
      <header className="customer-tracking-heading">
        <h1 className="customer-tracking-title">Track a parcel</h1>
        <p className="customer-tracking-subtitle">Enter your tracking number to see the latest delivery status.</p>
      </header>

      <section className="customer-tracking-metrics" aria-label="Delivery summary">
        {[
          { label: 'Active deliveries', Icon: Package, attention: false },
          { label: 'Delivered this month', Icon: Truck, attention: false },
          { label: 'Needs attention', Icon: AlertTriangle, attention: true },
        ].map(({ label, Icon, attention }) => (
          <div className="customer-tracking-metric" key={label}>
            <span className={`customer-tracking-metric-icon${attention ? ' customer-tracking-metric-icon--attention' : ''}`} aria-hidden="true">
              <Icon size={22} />
            </span>
            <div>
              <p className="customer-tracking-metric-label">{label}</p>
              <span className="customer-tracking-metric-value" aria-label="Unavailable">—</span>
            </div>
          </div>
        ))}
      </section>
      <p className="customer-tracking-summary-note">Customer delivery statistics are not connected yet.</p>

      <div className="customer-tracking-card">
        <form className="customer-tracking-form" onSubmit={handleTrack}>
          <label className="customer-tracking-label" htmlFor="customer-tracking-number">Tracking number</label>
          <div className="customer-tracking-controls">
            <input
              className="customer-tracking-input"
              id="customer-tracking-number"
              name="trackingNumber"
              type="text"
              placeholder="SD-24819"
              value={trackingNumber}
              onChange={(event) => {
                setTrackingNumber(event.target.value)
                setInputError('')
                setSubmittedNumber('')
              }}
              required
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={Boolean(inputError)}
              aria-describedby={`customer-tracking-api-note${inputError ? ' customer-tracking-input-error' : ''}`}
            />
            <button className="customer-tracking-button" type="submit"><Search size={16} aria-hidden="true" />Track</button>
          </div>
          {inputError && <p id="customer-tracking-input-error" className="customer-tracking-error" role="alert">{inputError}</p>}
          <p id="customer-tracking-api-note" className="customer-tracking-api-note">
            Live tracking is not connected yet. Parcel details, delivery history, and real-time updates are unavailable.
          </p>
          <div className="customer-tracking-search-feedback" role="status" aria-atomic="true">
            {submittedNumber && <p>Entered tracking number: <strong>{submittedNumber}</strong>. Tracking is currently unavailable; this number has not been looked up.</p>}
          </div>
        </form>
        <ParcelDetails parcel={null} />
      </div>
    </div>
  )
}
