export interface CustomerRequestSnapshot<T> {
  readonly data: T | null
  readonly error: string
  readonly loading: boolean
}

export interface CustomerRequestFailure {
  readonly message: string
  readonly temporary: boolean
  readonly accessDenied: boolean
}

/** One request scope: never share this state between parcels or customer sessions. */
export function createCustomerRequest<T>(options: {
  load: (signal: AbortSignal) => Promise<T>
  onAccessError: (error: unknown) => boolean
  describeError: (error: unknown) => CustomerRequestFailure
  keepPreviousDataOnRefresh?: boolean
  enabled?: boolean
}) {
  let snapshot: CustomerRequestSnapshot<T> = { data: null, error: '', loading: options.enabled !== false }
  let active = false
  let blocked = false
  let inFlight: AbortController | null = null
  let queued = false
  const listeners = new Set<() => void>()

  const publish = (next: CustomerRequestSnapshot<T>) => {
    snapshot = next
    listeners.forEach(listener => listener())
  }

  async function run() {
    const controller = new AbortController()
    inFlight = controller
    const isCurrent = () => active && inFlight === controller && !controller.signal.aborted
    publish({ data: options.keepPreviousDataOnRefresh ? snapshot.data : null, error: '', loading: true })
    try {
      const data = await options.load(controller.signal)
      if (isCurrent()) publish({ data, error: '', loading: false })
    } catch (error) {
      if (!isCurrent()) return
      const failure = options.describeError(error)
      blocked = failure.accessDenied
      if (blocked) queued = false
      publish({
        data: options.keepPreviousDataOnRefresh && failure.temporary && !blocked ? snapshot.data : null,
        error: failure.message,
        loading: false,
      })
      // Clear private data before notifying the page's session handler, even if
      // that handler does not redirect. Access failures cannot retry this scope.
      try {
        if (options.onAccessError(error)) {
          blocked = true
          queued = false
          publish({ data: null, error: '', loading: false })
        }
      } catch {
        blocked = true
        queued = false
        publish({ data: null, error: failure.message, loading: false })
      }
    } finally {
      if (inFlight === controller) {
        inFlight = null
        if (active && queued && !blocked) {
          queued = false
          void run()
        }
      }
    }
  }

  // Calls during a request coalesce into one subsequent read, so an update
  // received while a snapshot is loading cannot be lost or starve that request.
  const refresh = () => {
    if (!active || blocked) return
    if (inFlight) queued = true
    else void run()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refresh,
    start: () => {
      if (active || options.enabled === false) return
      active = true
      blocked = false
      refresh()
    },
    stop: () => {
      active = false
      queued = false
      inFlight?.abort()
      inFlight = null
      publish({ data: null, error: '', loading: false })
    },
  }
}
