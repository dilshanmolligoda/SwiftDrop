import { useState, type FormEvent } from 'react'
import './PublicTrackingPage.css'

export const PublicTrackingPage = () => {
  const [trackingNumber, setTrackingNumber] = useState('')
  const [submittedTrackingNumber, setSubmittedTrackingNumber] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    const normalizedTrackingNumber = trackingNumber.trim().toUpperCase()
    setTrackingNumber(normalizedTrackingNumber)

    if (!normalizedTrackingNumber) {
      setSubmittedTrackingNumber('')
      setError('Please enter a tracking number.')
      return
    }

    setError('')
    setSubmittedTrackingNumber(normalizedTrackingNumber)
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
                setError('')
              }}
              placeholder="Enter tracking number"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={`public-tracking-instructions public-tracking-notice${error ? ' public-tracking-error' : ''}`}
            />
            <button className="tracking-card__submit" type="submit">
              Track Parcel
            </button>
          </div>
          {error && (
            <p id="public-tracking-error" className="tracking-card__error" role="alert">
              {error}
            </p>
          )}
        </form>

        <p id="public-tracking-notice" className="tracking-card__notice">
          Live backend tracking is not connected yet. This page only confirms the
          number you enter; delivery progress is not available yet.
        </p>

        <div className="tracking-card__confirmation" role="status" aria-atomic="true">
          {submittedTrackingNumber && (
            <p>
              Submitted tracking number:{' '}
              <strong className="tracking-card__number">{submittedTrackingNumber}</strong>
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
