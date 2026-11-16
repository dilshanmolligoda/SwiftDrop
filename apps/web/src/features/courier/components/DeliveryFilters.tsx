import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Search, X } from 'lucide-react'
import type { ParcelStatus } from '../types/courier.types'
import { FILTERABLE_STATUSES, STATUS_LABELS, isParcelStatus } from '../utils/deliveryStatus'

const SEARCH_DEBOUNCE_MS = 350

interface DeliveryFiltersProps {
  readonly search: string
  readonly status: ParcelStatus | undefined
  readonly onSearchChange: (search: string) => void
  readonly onStatusChange: (status: ParcelStatus | undefined) => void
}

export function DeliveryFilters({ search, status, onSearchChange, onStatusChange }: DeliveryFiltersProps) {
  const searchId = useId()
  const statusId = useId()
  const [draft, setDraft] = useState(search)
  const [syncedSearch, setSyncedSearch] = useState(search)
  const onSearchChangeRef = useRef(onSearchChange)

  // Adopt external changes (e.g. "Clear filters") without clobbering typing.
  if (search !== syncedSearch) {
    setSyncedSearch(search)
    if (search !== draft.trim()) setDraft(search)
  }

  useEffect(() => {
    onSearchChangeRef.current = onSearchChange
  })

  useEffect(() => {
    const trimmed = draft.trim()
    if (trimmed === search) return
    const timer = window.setTimeout(() => onSearchChangeRef.current(trimmed), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft, search])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSearchChange(draft.trim())
  }

  return (
    <form className="cp-filters" role="search" onSubmit={handleSubmit}>
      <div className="cp-filters__search">
        <label htmlFor={searchId} className="cp-sr-only">
          Search by tracking number or recipient
        </label>
        <Search className="cp-filters__search-icon" aria-hidden="true" />
        <input
          id={searchId}
          type="search"
          className="cp-input cp-filters__search-input"
          placeholder="Search tracking number or recipient"
          value={draft}
          maxLength={100}
          onChange={(event) => setDraft(event.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
        {draft && (
          <button
            type="button"
            className="cp-filters__clear"
            onClick={() => {
              setDraft('')
              onSearchChange('')
            }}
            aria-label="Clear search"
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="cp-filters__status">
        <label htmlFor={statusId} className="cp-sr-only">
          Filter by delivery status
        </label>
        <select
          id={statusId}
          className="cp-select"
          value={status ?? ''}
          onChange={(event) => {
            const value = event.target.value
            onStatusChange(isParcelStatus(value) ? value : undefined)
          }}
        >
          <option value="">All statuses</option>
          {FILTERABLE_STATUSES.map((option) => (
            <option key={option} value={option}>
              {STATUS_LABELS[option]}
            </option>
          ))}
        </select>
      </div>
    </form>
  )
}
