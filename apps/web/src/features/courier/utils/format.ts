/** The courier API defines "today" in this time zone. */
export const COURIER_TIME_ZONE = 'Asia/Colombo'

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: COURIER_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: COURIER_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

const longDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const todayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: COURIER_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function toDate(iso: string): Date | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(iso: string): string {
  const date = toDate(iso)
  return date ? dateTimeFormatter.format(date) : '—'
}

export function formatTime(iso: string): string {
  const date = toDate(iso)
  return date ? timeFormatter.format(date) : '—'
}

/** Formats a calendar day string (YYYY-MM-DD) without shifting it across time zones. */
export function formatCalendarDay(day: string): string {
  const date = toDate(`${day}T00:00:00Z`)
  return date ? longDateFormatter.format(date) : day
}

export function formatToday(): string {
  return todayFormatter.format(new Date())
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatWeight(grams: number | null): string {
  if (grams === null) return 'Not specified'
  if (grams < 1000) return `${grams} g`
  return `${(grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 2)} kg`
}

export function getFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '')
  return initials.join('') || '?'
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | undefined): value is string {
  return !!value && UUID_PATTERN.test(value)
}

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: COURIER_TIME_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
})

export function getGreeting(now = new Date()): string {
  const hour = Number(hourFormatter.format(now))
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
