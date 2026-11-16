import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, ShieldAlert, WifiOff } from 'lucide-react'
import { ApiError, apiRequest, isAbortError } from '../../api/client'
import { SessionContext, type SessionContextValue, type SessionUser, type UserRole } from './session'
import './RequireRole.css'

type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'authenticated'; readonly user: SessionUser }
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'error'; readonly message: string }

interface RequireRoleProps {
  readonly roles: readonly UserRole[]
  readonly children: ReactNode
}

/**
 * Route guard that reuses the existing cookie session (`GET /auth/me`).
 * Unauthenticated visitors are redirected to /login; signed-in users with the
 * wrong role see an access-denied screen instead of the protected page, and
 * accounts that are not yet approved are sent to /application-status.
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [state, setState] = useState<SessionState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    apiRequest<SessionUser>('/auth/me', { signal: controller.signal })
      .then((user) => setState({ status: 'authenticated', user }))
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) {
          setState({ status: 'unauthenticated' })
          return
        }
        setState({
          status: 'error',
          message:
            error instanceof ApiError && error.status > 0
              ? `Could not verify your session (HTTP ${error.status}).`
              : 'Unable to reach the SwiftDrop server. Check your connection and try again.',
        })
      })

    return () => controller.abort()
  }, [attempt])

  const signOut = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' })
    } catch {
      // Clear the client view even if the network call fails.
    }
    navigate('/login', { replace: true })
  }, [navigate])

  const onSessionExpired = useCallback(() => setState({ status: 'unauthenticated' }), [])

  const contextValue = useMemo<SessionContextValue | null>(
    () => (state.status === 'authenticated' ? { user: state.user, signOut, onSessionExpired } : null),
    [state, signOut, onSessionExpired],
  )

  if (state.status === 'loading') {
    return (
      <div className="session-gate" role="status" aria-live="polite">
        <Loader2 className="session-gate__spinner" aria-hidden="true" />
        <p className="session-gate__text">Checking your session…</p>
      </div>
    )
  }

  if (state.status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (state.status === 'error') {
    return (
      <div className="session-gate">
        <div className="session-gate__card" role="alert">
          <WifiOff className="session-gate__icon" aria-hidden="true" />
          <h1 className="session-gate__title">Connection problem</h1>
          <p className="session-gate__text">{state.message}</p>
          <button type="button" className="session-gate__btn"             onClick={() => {
              setState({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!roles.includes(state.user.role)) {
    return (
      <div className="session-gate">
        <div className="session-gate__card" role="alert">
          <ShieldAlert className="session-gate__icon session-gate__icon--danger" aria-hidden="true" />
          <h1 className="session-gate__title">Access denied</h1>
          <p className="session-gate__text">
            You are signed in as <strong>{state.user.fullName}</strong> ({state.user.role.toLowerCase()}). This area
            is only available to {roles.map((role) => role.toLowerCase()).join(' or ')} accounts.
          </p>
          <div className="session-gate__actions">
            <Link to="/login" className="session-gate__btn session-gate__btn--ghost">
              Go to sign in
            </Link>
            <button type="button" className="session-gate__btn" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Pending or rejected applicants cannot use role portals; the API enforces the
  // same rule, so send them to their application status instead of failing calls.
  if (state.user.approvalStatus !== 'APPROVED') {
    return <Navigate to="/application-status" replace />
  }

  return <SessionContext.Provider value={contextValue}>{children}</SessionContext.Provider>
}
