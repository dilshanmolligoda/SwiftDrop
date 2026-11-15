import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ParcelStatus } from '../types/courier.types'
import { isParcelStatus } from '../utils/deliveryStatus'

const SEARCH_MAX_LENGTH = 100

export interface DeliveryListParams {
  readonly page: number
  readonly status: ParcelStatus | undefined
  readonly search: string
  readonly setPage: (page: number) => void
  readonly setStatus: (status: ParcelStatus | undefined) => void
  readonly setSearch: (search: string) => void
  readonly clearFilters: () => void
}

/**
 * Keeps list filters in the URL (?page=&status=&q=) so they survive refreshes,
 * the back button and links from the dashboard summary cards.
 */
export function useDeliveryListParams(): DeliveryListParams {
  const [searchParams, setSearchParams] = useSearchParams()

  const rawPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const rawStatus = searchParams.get('status')
  const status = isParcelStatus(rawStatus) ? rawStatus : undefined
  const search = (searchParams.get('q') ?? '').slice(0, SEARCH_MAX_LENGTH)

  const update = useCallback(
    (changes: Record<string, string | undefined>) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return useMemo(
    () => ({
      page,
      status,
      search,
      setPage: (nextPage: number) => update({ page: nextPage > 1 ? String(nextPage) : undefined }),
      setStatus: (nextStatus: ParcelStatus | undefined) => update({ status: nextStatus, page: undefined }),
      setSearch: (nextSearch: string) =>
        update({ q: nextSearch.trim().slice(0, SEARCH_MAX_LENGTH) || undefined, page: undefined }),
      clearFilters: () => update({ status: undefined, q: undefined, page: undefined }),
    }),
    [page, status, search, update],
  )
}
