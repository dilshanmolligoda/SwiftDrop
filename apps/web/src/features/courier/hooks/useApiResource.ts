import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiError } from '../../../api/client'
import { useApiErrorHandler } from './useApiErrorHandler'

export interface ApiResource<T> {
  readonly data: T | null
  readonly error: ApiError | null
  readonly isLoading: boolean
  readonly reload: () => void
}

interface SettledState<T> {
  /** Request (key + reload count) this result belongs to. */
  readonly requestId: string | null
  readonly key: string | null
  readonly data: T | null
  readonly error: ApiError | null
}

interface ApiResourceOptions {
  /** Keep showing the previous result while a new key loads (e.g. paging). */
  readonly keepPreviousData?: boolean
}

/**
 * Loads data for `requestKey`, cancelling stale requests when the key changes
 * or the component unmounts. `reload()` re-runs the current request.
 * Loading state is derived: a request is loading until its result settles.
 */
export function useApiResource<T>(
  requestKey: string,
  loader: (signal: AbortSignal) => Promise<T>,
  { keepPreviousData = false }: ApiResourceOptions = {},
): ApiResource<T> {
  const handleError = useApiErrorHandler()
  const loaderRef = useRef(loader)
  const [reloadCount, setReloadCount] = useState(0)
  const [settled, setSettled] = useState<SettledState<T>>({ requestId: null, key: null, data: null, error: null })
  const requestId = `${requestKey}#${reloadCount}`

  useEffect(() => {
    loaderRef.current = loader
  })

  useEffect(() => {
    const controller = new AbortController()

    loaderRef.current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setSettled({ requestId, key: requestKey, data, error: null })
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const apiError = handleError(error)
        if (!apiError) return
        // Keep the last good data so a failed refresh doesn't blank the page.
        setSettled((previous) => ({
          requestId,
          key: requestKey,
          data: previous.key === requestKey ? previous.data : null,
          error: apiError,
        }))
      })

    return () => controller.abort()
  }, [requestId, requestKey, handleError])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

  const isLoading = settled.requestId !== requestId
  const showData = keepPreviousData || settled.key === requestKey

  return {
    data: showData ? settled.data : null,
    error: isLoading ? null : settled.error,
    isLoading,
    reload,
  }
}
