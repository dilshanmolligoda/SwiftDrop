import { RefreshCw } from 'lucide-react'
import type { ApiError } from '../../../api/client'
import { ErrorAlert } from './StateViews'

interface ConflictAlertProps {
  readonly error: ApiError
  readonly onRefresh: () => void
}

/** Error banner for status changes; offers a refresh when the status moved on (409/404). */
export function ConflictAlert({ error, onRefresh }: ConflictAlertProps) {
  const canRefresh = error.status === 409 || error.status === 404
  return (
    <div className="cp-conflict">
      <ErrorAlert error={error} />
      {canRefresh && (
        <button type="button" className="cp-btn cp-btn--ghost cp-btn--sm" onClick={onRefresh}>
          <RefreshCw aria-hidden="true" />
          Refresh delivery
        </button>
      )}
    </div>
  )
}
