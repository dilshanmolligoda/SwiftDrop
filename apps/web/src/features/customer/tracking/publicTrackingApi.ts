import { env } from '../../../lib/env'
import { STATUS_DETAILS, type ParcelStatus } from './customerTrackingApi'

export interface PublicTrackingResult {
  readonly trackingNumber: string
  readonly status: ParcelStatus
  readonly updatedAt?: string
  readonly history: readonly { status: ParcelStatus; occurredAt: string }[]
}

type PublicTrackingErrorKind = 'validation' | 'legacy' | 'not-found' | 'rate-limit' | 'server' | 'network'

export class PublicTrackingError extends Error {
  readonly kind: PublicTrackingErrorKind
  readonly retryAfterSeconds?: number

  constructor(kind: PublicTrackingErrorKind, message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'PublicTrackingError'
    this.kind = kind
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function normalizePublicTrackingNumber(value: string): string {
  const number = value.trim().toUpperCase()
  if (number.length > 64 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(number)) {
    throw new PublicTrackingError('validation', 'Enter a valid tracking number using letters, digits, and separating hyphens.')
  }
  if (!/^SD-[A-F0-9]{32}$/.test(number)) {
    throw new PublicTrackingError('legacy', 'This tracking number requires customer sign-in. Use customer tracking for older tracking numbers.')
  }
  return number
}

function invalidResponse(): never {
  throw new PublicTrackingError('server', 'SwiftDrop returned an invalid tracking response. Please try again.')
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse()
  return value as Record<string, unknown>
}

function status(value: unknown): ParcelStatus {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(STATUS_DETAILS, value)) return invalidResponse()
  return value as ParcelStatus
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return invalidResponse()
  return value
}

export async function getPublicTracking(value: string, signal: AbortSignal): Promise<PublicTrackingResult> {
  const trackingNumber = normalizePublicTrackingNumber(value)
  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}/tracking/${encodeURIComponent(trackingNumber)}`, {
      method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new PublicTrackingError('network', 'Unable to connect to SwiftDrop. Check your connection and try again.')
  }
  if (!response.ok) {
    if (response.status === 404) throw new PublicTrackingError('not-found', 'No parcel found. Check the tracking number and try again.')
    if (response.status === 400) throw new PublicTrackingError('validation', 'Check the tracking number and try again.')
    if (response.status === 429) {
      const value = response.headers.get('Retry-After') ?? ''
      const seconds = /^\d+$/.test(value) ? Math.min(3600, Math.max(1, Number(value))) : 60
      throw new PublicTrackingError('rate-limit', 'Too many tracking requests. Please wait before trying again.', seconds)
    }
    throw new PublicTrackingError('server', 'Tracking is temporarily unavailable. Please try again.')
  }
  let json: unknown
  try { json = await response.json() } catch { return invalidResponse() }
  const data = object(json)
  if (data.trackingNumber !== trackingNumber || !Array.isArray(data.history)) return invalidResponse()
  // Read only the public allowlist, even if a server response unexpectedly contains more fields.
  return {
    trackingNumber,
    status: status(data.status),
    ...(data.updatedAt === undefined ? {} : { updatedAt: timestamp(data.updatedAt) }),
    history: data.history.map(value => {
      const event = object(value)
      return { status: status(event.status), occurredAt: timestamp(event.occurredAt) }
    }),
  }
}
