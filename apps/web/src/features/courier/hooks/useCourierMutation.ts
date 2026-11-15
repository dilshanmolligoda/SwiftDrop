import { useCallback, useRef, useState } from 'react'
import type { ApiError } from '../../../api/client'
import { useApiErrorHandler } from './useApiErrorHandler'

export interface CourierMutation<TArgs extends unknown[], TResult> {
  /** Resolves with the result, or undefined if the request failed. */
  readonly run: (...args: TArgs) => Promise<TResult | undefined>
  readonly isPending: boolean
  readonly error: ApiError | null
  readonly clearError: () => void
}

/** Runs a write request with pending/error state and double-submit protection. */
export function useCourierMutation<TArgs extends unknown[], TResult>(
  mutate: (...args: TArgs) => Promise<TResult>,
): CourierMutation<TArgs, TResult> {
  const handleError = useApiErrorHandler()
  const inFlight = useRef(false)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const run = useCallback(
    async (...args: TArgs) => {
      if (inFlight.current) return undefined
      inFlight.current = true
      setIsPending(true)
      setError(null)
      try {
        return await mutate(...args)
      } catch (caught) {
        const apiError = handleError(caught)
        if (apiError) setError(apiError)
        return undefined
      } finally {
        inFlight.current = false
        setIsPending(false)
      }
    },
    [mutate, handleError],
  )

  const clearError = useCallback(() => setError(null), [])

  return { run, isPending, error, clearError }
}
