import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { LiveIndicator } from '../../../lib/realtime/LiveIndicator'
import { useParcelRealtime } from '../../../lib/realtime/useParcelRealtime'
import { STATUS_DETAILS } from '../tracking/customerTrackingApi'
import {
  getPublicTracking, normalizePublicTrackingNumber, PublicTrackingError,
  type PublicTrackingResult,
} from '../tracking/publicTrackingApi'
import './PublicTrackingPage.css'

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo',
  }).format(new Date(value))
}

export const PublicTrackingPage = () => {
  const [trackingNumber, setTrackingNumber] = useState('')
  const [result, setResult] = useState<PublicTrackingResult | null>(null)
  const [error, setError] = useState<PublicTrackingError | null>(null)
  const [loading, setLoading] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const [retryReady, setRetryReady] = useState(false)
  const activeRequest = useRef<AbortController | null>(null)
  const lastNumber = useRef('')

  useEffect(() => () => activeRequest.current?.abort(), [])
  useEffect(() => {
    if (!retryAt) return
    const timer = window.setTimeout(() => setRetryReady(true), Math.max(0, retryAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [retryAt])

  const coolingDown = Boolean(retryAt) && !retryReady
  const inputError = error?.kind === 'validation' || error?.kind === 'legacy'

  const lookup = async (value: string): Promise<void> => {
    if (coolingDown) return
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setResult(null)
    setError(null)
    setLoading(false)
    setRetryAt(0)
    setRetryReady(false)
    const normalized = value.trim().toUpperCase()
    setTrackingNumber(normalized)
    try {
      // Legacy identifiers never reach the unauthenticated lookup endpoint.
      lastNumber.current = normalizePublicTrackingNumber(normalized)
      setLoading(true)
      const parcel = await getPublicTracking(lastNumber.current, controller.signal)
      if (!controller.signal.aborted) setResult(parcel)
    } catch (cause) {
      if (controller.signal.aborted) return
      const failure = cause instanceof PublicTrackingError ? cause
        : new PublicTrackingError('server', 'Tracking is temporarily unavailable. Please try again.')
      setError(failure)
      if (failure.kind === 'rate-limit') setRetryAt(Date.now() + (failure.retryAfterSeconds ?? 60) * 1000)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  // Live updates: when the shown parcel changes, re-read it in the background.
  // A failed background read (e.g. rate limit) keeps the current result.
  const refreshQuietly = useCallback(() => {
    const number = lastNumber.current
    if (!number) return
    const controller = new AbortController()
    activeRequest.current?.abort()
    activeRequest.current = controller
    getPublicTracking(number, controller.signal)
      .then(parcel => { if (!controller.signal.aborted) setResult(parcel) })
      .catch(() => undefined)
  }, [])
  const { state: liveState } = useParcelRealtime({
    subscription: result ? { scope: 'public', trackingNumber: result.trackingNumber } : null,
    onChange: refreshQuietly,
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void lookup(trackingNumber)
  }

  return (
    <main className="public-tracking" aria-labelledby="public-tracking-title">
      <div className="public-tracking__brand">
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M16 3L28 9.5V22.5L16 29L4 22.5V9.5L16 3ZM16 3V16M16 16L28 9.5M16 16L4 9.5M16 16V29"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        <span>SwiftDrop</span>
      </div>

      <section className="tracking-card" aria-labelledby="public-tracking-title">
        <h1 id="public-tracking-title" className="tracking-card__title">
          Track Your Parcel
        </h1>
        <p id="public-tracking-instructions" className="tracking-card__instructions">
          Enter your tracking number to check your delivery progress.
        </p>

        <form className="tracking-card__form" onSubmit={handleSubmit}>
          <label className="tracking-card__label" htmlFor="public-tracking-number">
            Tracking number
          </label>
          <div className="tracking-card__controls">
            <input
              id="public-tracking-number"
              className="tracking-card__input"
              name="trackingNumber"
              type="text"
              value={trackingNumber}
              onChange={(event) => {
                setTrackingNumber(event.target.value)
                if (!coolingDown) setError(null)
              }}
              placeholder="Enter tracking number"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              maxLength={64}
              aria-invalid={Boolean(inputError)}
              aria-describedby={`public-tracking-instructions public-tracking-notice${error ? ' public-tracking-error' : ''}`}
            />
            <button className="tracking-card__submit" type="submit" disabled={coolingDown}>
              Track Parcel
            </button>
          </div>
          {error && (
            <p id="public-tracking-error" className="tracking-card__error" role="alert">
              {error.message}
              {error.kind === 'legacy' && <> <a className="tracking-card__link" href="/customer/tracking">Sign in to customer tracking</a>.</>}
            </p>
          )}
        </form>

        <p id="public-tracking-notice" className="tracking-card__notice">
          Public tracking shows delivery status and recorded events only. Keep your
          tracking number private. Older tracking numbers require{' '}
          <a className="tracking-card__link" href="/customer/tracking">customer sign-in</a>.
        </p>

        <div className="tracking-card__confirmation" role="status" aria-atomic="true">
          {loading && <p>Loading parcel tracking…</p>}
          {error?.kind === 'rate-limit' && <p>{retryReady ? 'You can try again now.' : `Try again in about ${error.retryAfterSeconds ?? 60} seconds.`}</p>}
          {!loading && error && !inputError && (
            <button className="tracking-card__retry" type="button" disabled={coolingDown} onClick={() => void lookup(lastNumber.current)}>Try again</button>
          )}
        </div>
        <div aria-busy={loading}>
          {result && (
            <section className="tracking-card__result" aria-labelledby="public-tracking-result-title">
              <div className="tracking-card__result-heading">
                <h2 id="public-tracking-result-title" className="tracking-card__number">{result.trackingNumber}</h2>
                <span className={`tracking-card__badge tracking-card__badge--${STATUS_DETAILS[result.status].tone}`}>{STATUS_DETAILS[result.status].label}</span>
                <LiveIndicator state={liveState} />
              </div>
              {result.updatedAt && <p className="tracking-card__updated">Last updated: <time dateTime={result.updatedAt}>{formatTimestamp(result.updatedAt)} (Sri Lanka time)</time></p>}
              <h3 className="tracking-card__events-title">Recorded events</h3>
              {result.history.length ? (
                <ol className="tracking-card__timeline" aria-label="Recorded tracking events">
                  {result.history.map((event, index) => (
                    <li className="tracking-card__event" key={`${event.status}-${event.occurredAt}-${index}`}>
                      <span className={`tracking-card__badge tracking-card__badge--${STATUS_DETAILS[event.status].tone}`}>{STATUS_DETAILS[event.status].label}</span>
                      <time className="tracking-card__event-time" dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)} (Sri Lanka time)</time>
                    </li>
                  ))}
                </ol>
              ) : <p className="tracking-card__empty">No tracking events have been recorded yet. The status above is the current parcel status.</p>}
            </section>
          )}
        </div>
      </section>
    </main>
  )
}
