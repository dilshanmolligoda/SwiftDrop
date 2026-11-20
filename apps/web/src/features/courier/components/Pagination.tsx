import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaginationMeta } from '../types/courier.types'

interface PaginationProps {
  readonly pagination: PaginationMeta
  readonly onPageChange: (page: number) => void
  readonly disabled?: boolean
}

type PageToken = number | 'gap-start' | 'gap-end'

function getPageTokens(current: number, total: number): PageToken[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const pages = new Set([1, total, current - 1, current, current + 1])
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b)
  const tokens: PageToken[] = []
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1]
    if (previous !== undefined && page - previous > 1) {
      tokens.push(page < current ? 'gap-start' : 'gap-end')
    }
    tokens.push(page)
  })
  return tokens
}

export function Pagination({ pagination, onPageChange, disabled = false }: PaginationProps) {
  const { page, limit, total, totalPages } = pagination
  if (total === 0) return null

  const first = (page - 1) * limit + 1
  const last = Math.min(page * limit, total)

  return (
    <nav className="cp-pagination" aria-label="Delivery list pages">
      <p className="cp-pagination__summary" aria-live="polite">
        Showing <strong>{first}</strong>–<strong>{last}</strong> of <strong>{total}</strong>
      </p>
      {totalPages > 1 && (
        <ul className="cp-pagination__list">
          <li>
            <button
              type="button"
              className="cp-pagination__btn"
              onClick={() => onPageChange(page - 1)}
              disabled={disabled || page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          </li>
          {getPageTokens(page, totalPages).map((token) =>
            typeof token === 'number' ? (
              <li key={token}>
                <button
                  type="button"
                  className={`cp-pagination__btn ${token === page ? 'cp-pagination__btn--active' : ''}`}
                  onClick={() => onPageChange(token)}
                  disabled={disabled}
                  aria-label={`Page ${token}`}
                  aria-current={token === page ? 'page' : undefined}
                >
                  {token}
                </button>
              </li>
            ) : (
              <li key={token} className="cp-pagination__gap" aria-hidden="true">
                …
              </li>
            ),
          )}
          <li>
            <button
              type="button"
              className="cp-pagination__btn"
              onClick={() => onPageChange(page + 1)}
              disabled={disabled || page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </li>
        </ul>
      )}
    </nav>
  )
}
