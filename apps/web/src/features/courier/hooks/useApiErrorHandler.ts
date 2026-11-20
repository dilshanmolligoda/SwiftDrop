import { useCallback } from 'react'
import { isAbortError, toApiError, type ApiError } from '../../../api/client'
import { useSession } from '../../../app/auth/session'

/**
 * Normalises a thrown error into an ApiError and sends the user back to login
 * on 401. Returns null for aborted requests, which should be ignored.
 */
export function useApiErrorHandler(): (error: unknown) => ApiError | null {
  const { onSessionExpired } = useSession()

  return useCallback(
    (error: unknown) => {
      if (isAbortError(error)) return null
      const apiError = toApiError(error)
      if (apiError.status === 401) onSessionExpired()
      return apiError
    },
    [onSessionExpired],
  )
}
