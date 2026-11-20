export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** "in 25s", "in 2 min", "3 min ago" */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const diffSeconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const abs = Math.abs(diffSeconds)
  const text =
    abs < 60 ? `${abs}s` : abs < 3600 ? `${Math.round(abs / 60)} min` : `${Math.round(abs / 3600)} h`
  return diffSeconds >= 0 ? `in ${text}` : `${text} ago`
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
