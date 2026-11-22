import type { CustomerDelivery, DeliveryMetrics, VerifiedDeliveryCustomer } from './CustomerDeliveryContext'
import { isCustomerDeliveryStatus } from './customerDeliveryModel.ts'

interface DeliverySnapshot {
  readonly customerId: string | null
  readonly deliveries: readonly CustomerDelivery[]
  readonly metrics: DeliveryMetrics | null
  readonly isLoading: boolean
  readonly error: string | null
  readonly authorizationFailed: boolean
}

// The object identity also isolates two sessions of the same customer after logout.
interface CustomerScope { readonly customerId: string }
interface ReadRun {
  readonly scope: CustomerScope
  controller: AbortController
  promise: Promise<void>
}

const emptySnapshot = (): DeliverySnapshot => ({
  customerId: null, deliveries: [], metrics: null, isLoading: false,
  error: null, authorizationFailed: false,
})
const readError = 'Unable to refresh deliveries. Please try again.'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(readError)
  return value as Record<string, unknown>
}

function decimal(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' ||
    (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) throw new Error(readError)
  return Number(value)
}

function parseParcels(value: unknown, owner: string): CustomerDelivery[] {
  if (!Array.isArray(value)) throw new Error(readError)
  return value.map(item => {
    const record = object(item)
    if (record.customerId !== owner) throw new Error('ownership')
    const fields = ['id', 'trackingNumber', 'senderName', 'senderAddress', 'recipientName', 'recipientAddress', 'recipientPhone', 'createdAt'] as const
    for (const key of fields) if (typeof record[key] !== 'string') throw new Error(readError)
    const { id, trackingNumber, senderName, senderAddress, recipientName, recipientAddress, recipientPhone, createdAt } = record as Record<(typeof fields)[number], string>
    const { packageSize, status, deliveredAt } = record
    const weightKg = decimal(record.weightKg), costLkr = decimal(record.costLkr)
    if (!id || !trackingNumber || !isCustomerDeliveryStatus(status) ||
      (packageSize !== 'SMALL' && packageSize !== 'MEDIUM' && packageSize !== 'LARGE') ||
      !Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(costLkr) || costLkr < 0 ||
      !Number.isFinite(Date.parse(createdAt)) ||
      (deliveredAt != null && (typeof deliveredAt !== 'string' || !Number.isFinite(Date.parse(deliveredAt))))) {
      throw new Error(readError)
    }
    return {
      id, trackingNumber, senderName, senderAddress, recipientName, recipientAddress, recipientPhone,
      packageSize, weightKg, costLkr, status, createdAt,
      deliveredAt: typeof deliveredAt === 'string' ? deliveredAt : undefined,
    }
  })
}

function parseMetrics(value: unknown): DeliveryMetrics {
  const record = object(value)
  const { activeDeliveries, deliveredThisMonth, needsAttention } = record
  if (![activeDeliveries, deliveredThisMonth, needsAttention].every(count => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) ||
    record.timeZone !== 'UTC' || typeof record.reportingMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(record.reportingMonth)) {
    throw new Error(readError)
  }
  return { activeDeliveries, deliveredThisMonth, needsAttention } as DeliveryMetrics
}

/** Memory-only private state. No reads are allowed until /auth/me establishes an owner. */
export function createCustomerDeliveryStore(options: {
  apiBaseUrl: string
  fetch?: typeof globalThis.fetch
  clearLegacyCache?: () => void
}) {
  const fetcher = options.fetch ?? globalThis.fetch
  const listeners = new Set<() => void>()
  let snapshot = emptySnapshot()
  let scope: CustomerScope | null = null
  let current: ReadRun | null = null
  let queued = false
  let revision = 0

  function publish(patch: Partial<DeliverySnapshot>): void {
    snapshot = { ...snapshot, ...patch }
    listeners.forEach(listener => listener())
  }

  function clear(authorizationFailed = false): void {
    current?.controller.abort()
    current = null
    queued = false
    scope = null
    revision++
    options.clearLegacyCache?.()
    publish({ ...emptySnapshot(), authorizationFailed,
      error: authorizationFailed ? 'Your customer session could not be authorized. Please sign in again.' : null })
  }

  function rejectAccess(expectedScope: CustomerScope | null, status: number): void {
    if (expectedScope && scope === expectedScope && (status === 401 || status === 403)) clear(true)
  }

  function setVerifiedCustomer(customer: VerifiedDeliveryCustomer): void {
    if (!customer || customer.role !== 'CUSTOMER' || customer.approvalStatus !== 'APPROVED' ||
      customer.isActive !== true || typeof customer.id !== 'string' || !customer.id.trim()) {
      clear(true)
      return
    }
    if (scope?.customerId === customer.id) return
    clear()
    scope = { customerId: customer.id }
    publish({ customerId: customer.id })
  }

  const isCurrent = (run: ReadRun): boolean => current === run && scope === run.scope

  async function read<T>(run: ReadRun, path: string, parse: (data: unknown) => T): Promise<T> {
    const response = await fetcher(`${options.apiBaseUrl}${path}`, {
      method: 'GET', credentials: 'include', cache: 'no-store', signal: run.controller.signal,
    })
    if (response.status === 401 || response.status === 403) {
      if (isCurrent(run)) rejectAccess(run.scope, response.status)
      throw new Error(readError)
    }
    if (!response.ok) throw new Error(readError)
    try {
      return parse(await response.json())
    } catch (error) {
      if (error instanceof Error && error.message === 'ownership' && isCurrent(run)) rejectAccess(run.scope, 403)
      throw error
    }
  }

  async function readLoop(run: ReadRun): Promise<void> {
    try {
      do {
        queued = false
        const startedRevision = revision
        run.controller = new AbortController()
        publish({ isLoading: true, error: null })
        const [parcels, metrics] = await Promise.allSettled([
          read(run, '/parcels/me', value => parseParcels(value, run.scope.customerId)),
          read(run, '/customer/deliveries/summary', parseMetrics),
        ])
        if (!isCurrent(run)) return
        // A creation/local write after this read started must win. Re-read once afterwards.
        if (startedRevision !== revision) {
          queued = true
          continue
        }
        publish({
          deliveries: parcels.status === 'fulfilled' ? parcels.value : snapshot.deliveries,
          metrics: metrics.status === 'fulfilled' ? metrics.value : snapshot.metrics,
          error: parcels.status === 'rejected' || metrics.status === 'rejected' ? readError : null,
        })
      } while (queued && isCurrent(run))
    } finally {
      if (isCurrent(run)) {
        current = null
        publish({ isLoading: false })
      }
    }
  }

  function refresh(): Promise<void> {
    if (!scope) return Promise.resolve()
    if (current) {
      queued = true
      return current.promise
    }
    const run: ReadRun = { scope, controller: new AbortController(), promise: Promise.resolve() }
    current = run
    // Install the shared promise before any listener can request another refresh.
    run.promise = Promise.resolve().then(() => { if (isCurrent(run)) return readLoop(run) })
    return run.promise
  }

  return {
    getSnapshot: () => snapshot,
    getScope: () => scope,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setVerifiedCustomer,
    clear: () => clear(),
    rejectAccess,
    refresh,
    updateDeliveries(expectedScope: CustomerScope | null, update: (items: readonly CustomerDelivery[]) => readonly CustomerDelivery[]): boolean {
      if (!expectedScope || scope !== expectedScope) return false
      revision++
      publish({ deliveries: update(snapshot.deliveries), metrics: null })
      return true
    },
  }
}
