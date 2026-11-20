import { useEffect, useState } from 'react'
import { env } from '../../../lib/env'

export type ParcelStatus = 'CREATED' | 'ASSIGNED' | 'PENDING' | 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'RETURNED'
export type DeliveryFilter = 'all' | 'active' | 'history'

export const STATUS_DETAILS: Record<ParcelStatus, { label: string; tone: string }> = {
  CREATED: { label: 'Created', tone: 'neutral' },
  ASSIGNED: { label: 'Assigned', tone: 'neutral' },
  PENDING: { label: 'Created', tone: 'neutral' },
  PICKED_UP: { label: 'Picked Up', tone: 'transit' },
  IN_TRANSIT: { label: 'In Transit', tone: 'transit' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', tone: 'transit' },
  DELIVERED: { label: 'Delivered', tone: 'delivered' },
  FAILED: { label: 'Failed', tone: 'failed' },
  RETURNED: { label: 'Returned', tone: 'returned' },
}

export interface HistoryDelivery {
  readonly id: string
  readonly trackingNumber: string
  readonly status: ParcelStatus
  readonly createdAt: string
  readonly destination?: string
  readonly deliveredAt?: string
}

export interface TrackingParcel extends HistoryDelivery {
  readonly origin?: string
  readonly updatedAt?: string
  readonly history: readonly { status: ParcelStatus; occurredAt: string }[]
}

export interface DeliveryPage {
  readonly items: readonly HistoryDelivery[]
  readonly page: number
  readonly pageSize: number
  readonly total: number
}

export interface DeliverySummary {
  readonly activeDeliveries: number
  readonly deliveredThisMonth: number
  readonly needsAttention: number
  readonly reportingMonth: string
  readonly timeZone: 'UTC'
}

export class CustomerApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'CustomerApiError'
    this.status = status
  }
}

function invalidResponse(): never {
  throw new CustomerApiError(0, 'The server returned an invalid response. Please try again.')
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse()
  return value as Record<string, unknown>
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalidResponse()
  return value
}

function timestamp(value: unknown): string {
  const text = string(value)
  if (!Number.isFinite(Date.parse(text))) return invalidResponse()
  return text
}

function status(value: unknown): ParcelStatus {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(STATUS_DETAILS, value)) return invalidResponse()
  return value as ParcelStatus
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalidResponse()
  return value
}

function delivery(value: unknown): HistoryDelivery {
  const data = object(value)
  return {
    id: string(data.id), trackingNumber: string(data.trackingNumber),
    status: status(data.status), createdAt: timestamp(data.createdAt),
    ...(data.destination === undefined ? {} : { destination: string(data.destination) }),
    ...(data.deliveredAt === undefined ? {} : { deliveredAt: timestamp(data.deliveredAt) }),
  }
}

async function request<T>(path: string, parse: (value: unknown) => T, signal: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, { method: 'GET', credentials: 'include', cache: 'no-store', signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new CustomerApiError(0, 'Unable to connect to SwiftDrop. Please check your connection and try again.')
  }
  if (!response.ok) {
    const message = response.status === 401 ? 'Your session has expired. Please sign in again.'
      : response.status === 403 ? 'Your account cannot access customer deliveries.'
        : response.status === 404 ? 'No parcel found. Check the tracking number and try again.'
          : response.status === 400 ? 'Check the tracking number or search filters and try again.'
            : 'SwiftDrop could not load this information. Please try again.'
    throw new CustomerApiError(response.status, message)
  }
  let data: unknown
  try { data = await response.json() } catch { return invalidResponse() }
  return parse(data)
}

export function normalizeTrackingNumber(value: string): string {
  const normalized = value.trim().toUpperCase()
  if (normalized.length > 64 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(normalized)) {
    throw new CustomerApiError(400, 'Enter a tracking number using letters, digits, and separating hyphens (up to 64 characters).')
  }
  return normalized
}

export function trackingDetailsLink(trackingNumber: string): string {
  return `/customer/tracking?${new URLSearchParams({ trackingNumber: normalizeTrackingNumber(trackingNumber) })}`
}

export function getCustomerTracking(number: string, signal: AbortSignal): Promise<TrackingParcel> {
  const trackingNumber = normalizeTrackingNumber(number)
  return request(`/customer/tracking/${encodeURIComponent(trackingNumber)}`, value => {
    const data = object(value)
    const item = delivery(data)
    if (item.trackingNumber !== trackingNumber || !Array.isArray(data.history)) return invalidResponse()
    return {
      ...item,
      ...(data.origin === undefined ? {} : { origin: string(data.origin) }),
      ...(data.updatedAt === undefined ? {} : { updatedAt: timestamp(data.updatedAt) }),
      history: data.history.map(event => {
        const recorded = object(event)
        return { status: status(recorded.status), occurredAt: timestamp(recorded.occurredAt) }
      }),
    }
  }, signal)
}

export function getCustomerDeliveries(query: { filter: DeliveryFilter; search: string; page: number; pageSize: number }, signal: AbortSignal): Promise<DeliveryPage> {
  const params = new URLSearchParams({ filter: query.filter, search: query.search.trim().toUpperCase(), page: String(query.page), pageSize: String(query.pageSize) })
  return request(`/customer/deliveries?${params}`, value => {
    const data = object(value)
    if (!Array.isArray(data.items)) return invalidResponse()
    const page = count(data.page), pageSize = count(data.pageSize), total = count(data.total)
    if (page !== query.page || pageSize !== query.pageSize || page < 1 || pageSize < 1 || pageSize > 100 || data.items.length > pageSize || data.items.length > total) return invalidResponse()
    return { items: data.items.map(delivery), page, pageSize, total }
  }, signal)
}

export function getCustomerSummary(signal: AbortSignal): Promise<DeliverySummary> {
  return request('/customer/deliveries/summary', value => {
    const data = object(value)
    if (data.timeZone !== 'UTC' || typeof data.reportingMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.reportingMonth)) return invalidResponse()
    return {
      activeDeliveries: count(data.activeDeliveries), deliveredThisMonth: count(data.deliveredThisMonth),
      needsAttention: count(data.needsAttention), reportingMonth: data.reportingMonth, timeZone: 'UTC',
    }
  }, signal)
}

export function customerErrorMessage(error: unknown): string {
  return error instanceof CustomerApiError ? error.message : 'Unable to load this information. Please try again.'
}

/** A new query immediately hides the previous result; aborted requests cannot publish data. */
export function useCustomerRequest<T>(
  load: (signal: AbortSignal) => Promise<T>,
  onAccessError: (error: unknown) => boolean,
  enabled = true,
) {
  const [attempt, setAttempt] = useState(0)
  const [completed, setCompleted] = useState<{
    load: typeof load; attempt: number; data: T | null; error: string
  } | null>(null)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    void (async () => {
      try {
        const data = await load(controller.signal)
        if (!controller.signal.aborted) setCompleted({ load, attempt, data, error: '' })
      } catch (error) {
        if (!controller.signal.aborted && !onAccessError(error)) {
          setCompleted({ load, attempt, data: null, error: customerErrorMessage(error) })
        }
      }
    })()
    return () => controller.abort()
  }, [load, onAccessError, enabled, attempt])

  const current = enabled && completed?.load === load && completed.attempt === attempt ? completed : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? '',
    loading: enabled && !current,
    retry: () => setAttempt(value => value + 1),
  }
}
