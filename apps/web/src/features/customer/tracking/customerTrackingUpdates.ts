import { useEffect } from 'react'

/** Local adapter input, not a server event name or a transport wire contract. */
export interface CustomerTrackingNotification {
  readonly parcelId: string
  /** Optional opaque identity supplied by the future shared client's adapter. */
  readonly notificationId?: string
}

/** Member 8's future client owns connection, authorization and reconnection. */
export interface CustomerTrackingUpdateSource {
  subscribe(
    parcelId: string,
    onNotification: (notification: CustomerTrackingNotification) => void,
  ): () => void
}

export function subscribeToCustomerTrackingUpdates(
  source: CustomerTrackingUpdateSource,
  parcelId: string,
  refresh: () => void,
): () => void {
  let active = true
  const seen = new Set<string>()
  const unsubscribe = source.subscribe(parcelId, notification => {
    if (!active || !notification || notification.parcelId !== parcelId) return
    const id = notification.notificationId
    if (id !== undefined) {
      if (typeof id !== 'string' || !id || id.length > 256 || seen.has(id)) return
      seen.add(id)
      // Bound duplicate detection to this subscription, not a global cache.
      if (seen.size > 100) seen.delete(seen.values().next().value!)
    }
    refresh()
  })
  return () => {
    if (!active) return
    active = false
    seen.clear()
    unsubscribe()
  }
}

export function useCustomerTrackingUpdates(
  source: CustomerTrackingUpdateSource | undefined,
  parcelId: string | undefined,
  refresh: () => void,
) {
  useEffect(() => {
    if (!source || !parcelId) return
    return subscribeToCustomerTrackingUpdates(source, parcelId, refresh)
  }, [source, parcelId, refresh])
}
