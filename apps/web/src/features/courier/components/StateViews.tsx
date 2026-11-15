import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react'
import type { ApiError } from '../../../api/client'
import { describeApiError } from '../utils/errors'
import './StateViews.css'

export function LoadingState({ label = 'Loading…' }: { readonly label?: string }) {
  return (
    <div className="cp-state" role="status" aria-live="polite">
      <Loader2 className="cp-state__icon cp-state__icon--primary cp-spin" aria-hidden="true" />
      <p className="cp-state__text">{label}</p>
    </div>
  )
}

interface EmptyStateProps {
  readonly title: string
  readonly description?: string
  readonly action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="cp-state">
      <span className="cp-state__badge" aria-hidden="true">
        <Inbox />
      </span>
      <p className="cp-state__title">{title}</p>
      {description && <p className="cp-state__text">{description}</p>}
      {action}
    </div>
  )
}

interface ErrorStateProps {
  readonly error: ApiError
  readonly onRetry?: () => void
  readonly action?: ReactNode
}

export function ErrorState({ error, onRetry, action }: ErrorStateProps) {
  const { title, messages } = describeApiError(error)
  return (
    <div className="cp-state" role="alert">
      <span className="cp-state__badge cp-state__badge--danger" aria-hidden="true">
        <AlertTriangle />
      </span>
      <p className="cp-state__title">{title}</p>
      {messages.map((message) => (
        <p key={message} className="cp-state__text">
          {message}
        </p>
      ))}
      <div className="cp-state__actions">
        {onRetry && error.status !== 401 && (
          <button type="button" className="cp-btn cp-btn--soft" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </button>
        )}
        {action}
      </div>
    </div>
  )
}

/** Inline banner for a failed mutation, listing every validation message. */
export function ErrorAlert({ error }: { readonly error: ApiError }) {
  const { title, messages } = describeApiError(error)
  return (
    <div className="cp-alert cp-alert--danger" role="alert">
      <AlertTriangle aria-hidden="true" />
      <div className="cp-alert__body">
        <p className="cp-alert__title">{title}</p>
        {messages.length === 1 ? (
          <p>{messages[0]}</p>
        ) : (
          <ul className="cp-alert__list">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
