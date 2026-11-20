import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Check, Circle, Package, RotateCcw, Search, Truck, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { env } from '../../../lib/env'
import {
  CustomerApiError, customerErrorMessage, getCustomerSummary, getCustomerTracking,
  normalizeTrackingNumber, STATUS_DETAILS, useCustomerRequest,
  type ParcelStatus, type TrackingParcel,
} from '../tracking/customerTrackingApi'
import './CustomerTrackingPage.css'

type SessionState = 'checking' | 'customer' | 'redirecting' | 'error' | 'denied'
const TIMELINE_STAGES: readonly ParcelStatus[] = ['PENDING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']

function formatTimestamp(value?: string): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo',
  }).format(new Date(value))
}

function TrackingTimeline({ parcel }: { parcel: TrackingParcel | null }) {
  const rows: { status: ParcelStatus; occurredAt?: string; current?: boolean }[] = parcel
    ? parcel.history.map((event, index) => ({ ...event, current: index === parcel.history.length - 1 && event.status === parcel.status }))
    : TIMELINE_STAGES.map(status => ({ status }))
  if (parcel) {
    // A current status alone is not evidence that any previous stage happened.
    if (!rows.some(row => row.current)) rows.push({ status: parcel.status, current: true })
    const currentIndex = TIMELINE_STAGES.indexOf(parcel.status)
    if (currentIndex >= 0) {
      rows.push(...TIMELINE_STAGES.slice(currentIndex + 1)
        .filter(status => !parcel.history.some(event => event.status === status))
        .map(status => ({ status })))
    }
  }

  return (
    <ol className="customer-tracking-timeline" aria-label="Delivery progress">
      {rows.map(({ status, occurredAt, current }, index) => {
        const recorded = Boolean(occurredAt)
        const state = !recorded ? 'pending' : status === 'FAILED' ? 'failed'
          : status === 'RETURNED' ? 'returned' : current ? 'current' : 'completed'
        const Icon = !recorded ? Circle : status === 'FAILED' ? X : status === 'RETURNED' ? RotateCcw : current ? Circle : Check
        return (
          <li key={`${status}-${index}`} className={`customer-tracking-step customer-tracking-step--${state}`} aria-current={current ? 'step' : undefined}>
            <span className="customer-tracking-step-marker" aria-hidden="true"><Icon size={12} strokeWidth={3} /></span>
            <div>
              <p className="customer-tracking-step-label">{STATUS_DETAILS[status].label}</p>
              <p className="customer-tracking-step-description">
                {recorded ? current ? 'Current status · recorded event' : 'Recorded event'
                  : current ? 'Current status; event not recorded' : parcel ? 'Not yet recorded' : 'Awaiting tracking data'}
              </p>
              {occurredAt && <time className="customer-tracking-step-time" dateTime={occurredAt}>{formatTimestamp(occurredAt)} (Sri Lanka time)</time>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function ParcelDetails({ parcel }: { parcel: TrackingParcel | null }) {
  return (
    <section className="customer-tracking-details" aria-labelledby="customer-tracking-details-title">
      <div className="customer-tracking-details-header">
        <div>
          <h2 id="customer-tracking-details-title" className="customer-tracking-section-title">{parcel?.trackingNumber ?? 'Delivery progress'}</h2>
          {parcel && <p className="customer-tracking-route">{parcel.origin ?? 'Origin unavailable'} to {parcel.destination ?? 'Destination unavailable'}</p>}
          {parcel && <p className="customer-tracking-updated">Booked: <time dateTime={parcel.createdAt}>{formatTimestamp(parcel.createdAt)} (Sri Lanka time)</time></p>}
          {parcel?.updatedAt && <p className="customer-tracking-updated">Last updated: <time dateTime={parcel.updatedAt}>{formatTimestamp(parcel.updatedAt)} (Sri Lanka time)</time></p>}
        </div>
        <span className={`customer-tracking-badge customer-tracking-badge--${parcel ? STATUS_DETAILS[parcel.status].tone : 'neutral'}`}>
          {parcel ? STATUS_DETAILS[parcel.status].label : 'No tracking data'}
        </span>
      </div>
      {!parcel && <p className="customer-tracking-timeline-note">Enter a tracking number to load your parcel. No delivery stage has been confirmed.</p>}
      <TrackingTimeline parcel={parcel} />
    </section>
  )
}

function TrackingSearchForm({ initialNumber, onTrack }: { initialNumber: string; onTrack: (number: string) => void }) {
  const [trackingNumber, setTrackingNumber] = useState(initialNumber.trim().toUpperCase())
  const [inputError, setInputError] = useState('')
  const handleTrack = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const normalized = normalizeTrackingNumber(trackingNumber)
      setTrackingNumber(normalized)
      setInputError('')
      onTrack(normalized)
    } catch (error) {
      setInputError(customerErrorMessage(error))
    }
  }
  return (
    <form className="customer-tracking-form" onSubmit={handleTrack}>
      <label className="customer-tracking-label" htmlFor="customer-tracking-number">Tracking number</label>
      <div className="customer-tracking-controls">
        <input className="customer-tracking-input" id="customer-tracking-number" name="trackingNumber" type="text" placeholder="Enter tracking number"
          value={trackingNumber} onChange={event => { setTrackingNumber(event.target.value); setInputError('') }}
          required maxLength={64} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          aria-invalid={Boolean(inputError)} aria-describedby={`customer-tracking-api-note${inputError ? ' customer-tracking-input-error' : ''}`} />
        <button className="customer-tracking-button" type="submit"><Search size={16} aria-hidden="true" />Track</button>
      </div>
      {inputError && <p id="customer-tracking-input-error" className="customer-tracking-error" role="alert">{inputError}</p>}
      <p id="customer-tracking-api-note" className="customer-tracking-api-note">Search your own parcels. Statuses update when you submit a search; event times use Sri Lanka time.</p>
    </form>
  )
}

function CustomerTrackingContent({ onAccessError }: { onAccessError: (error: unknown) => boolean }) {
  const [params, setParams] = useSearchParams()
  const queryNumber = params.get('trackingNumber')
  let normalizedNumber = ''
  let queryError = ''
  try {
    if (queryNumber !== null) {
      if (params.getAll('trackingNumber').length !== 1) throw new CustomerApiError(400, 'Use a single tracking number in the page URL.')
      normalizedNumber = normalizeTrackingNumber(queryNumber)
    }
  } catch (error) {
    queryError = customerErrorMessage(error)
  }
  const loadTracking = useCallback((signal: AbortSignal) => getCustomerTracking(normalizedNumber, signal), [normalizedNumber])
  const { data: parcel, loading, error, retry } = useCustomerRequest(loadTracking, onAccessError, Boolean(normalizedNumber))
  const { data: summary, error: summaryError, retry: retrySummary } = useCustomerRequest(getCustomerSummary, onAccessError)
  const handleTrack = (number: string) => {
    const next = new URLSearchParams(params)
    next.set('trackingNumber', number)
    setParams(next)
    retry()
  }

  return (
    <div className="customer-tracking-page">
      <header className="customer-tracking-heading">
        <h1 className="customer-tracking-title">Track a parcel</h1>
        <p className="customer-tracking-subtitle">Enter your tracking number to see the latest delivery status.</p>
      </header>
      <section className="customer-tracking-metrics" aria-label="Delivery summary" aria-busy={!summary && !summaryError}>
        {[
          { label: 'Active deliveries', value: summary?.activeDeliveries, Icon: Package, attention: false },
          { label: 'Delivered this month', value: summary?.deliveredThisMonth, Icon: Truck, attention: false },
          { label: 'Needs attention', value: summary?.needsAttention, Icon: AlertTriangle, attention: true },
        ].map(({ label, value, Icon, attention }) => (
          <div className="customer-tracking-metric" key={label}>
            <span className={`customer-tracking-metric-icon${attention ? ' customer-tracking-metric-icon--attention' : ''}`} aria-hidden="true"><Icon size={22} /></span>
            <div>
              <p className="customer-tracking-metric-label">{label}</p>
              <span className="customer-tracking-metric-value" aria-label={value === undefined ? 'Unavailable' : undefined}>{value ?? '—'}</span>
            </div>
          </div>
        ))}
      </section>
      <div className="customer-tracking-summary-note" role={summaryError ? 'alert' : 'status'}>
        {summaryError ? <>{summaryError} <button className="customer-tracking-link customer-tracking-summary-retry" type="button" onClick={retrySummary}>Retry statistics</button></>
          : summary ? `Statistics cover your deliveries. Reporting month: ${summary.reportingMonth} (UTC).` : 'Loading delivery statistics…'}
      </div>
      <div className="customer-tracking-card">
        <TrackingSearchForm key={queryNumber ?? ''} initialNumber={queryNumber ?? ''} onTrack={handleTrack} />
        <div className="customer-tracking-search-feedback" role="status" aria-atomic="true">{loading && 'Loading parcel tracking…'}</div>
        {(queryError || error) && <p className="customer-tracking-error" role="alert">{queryError || error} {error && <button className="customer-tracking-link customer-tracking-summary-retry" type="button" onClick={retry}>Try again</button>}</p>}
        <div aria-busy={loading}><ParcelDetails parcel={parcel} /></div>
      </div>
    </div>
  )
}

export function CustomerTrackingPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionState>('checking')
  const [sessionError, setSessionError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const onAccessError = useCallback((error: unknown) => {
    if (!(error instanceof CustomerApiError) || ![401, 403].includes(error.status)) return false
    setSession(error.status === 401 ? 'redirecting' : 'denied')
    if (error.status === 401) navigate('/login', { replace: true })
    return true
  }, [navigate])

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

  return <CustomerTrackingContent onAccessError={onAccessError} />
}
