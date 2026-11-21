import { useEffect, useRef, useState } from 'react'
import {
  isNewerUpdate,
  RealtimeClientEvent,
  RealtimeServerEvent,
  type PublicRealtimeParcelUpdateV1,
  type RealtimeAck,
  type RealtimeParcelUpdateV1,
  type RealtimeSubscription,
} from '@swiftdrop/contracts'
import { acquireSocket, releaseSocket } from './realtimeClient'

export type RealtimeState = 'off' | 'connecting' | 'live' | 'reconnecting'

export type ParcelUpdate = RealtimeParcelUpdateV1 | PublicRealtimeParcelUpdateV1

export interface UseParcelRealtimeOptions {
  /** What to follow; null/undefined = nothing yet (the hook stays idle). */
  readonly subscription: RealtimeSubscription | null | undefined
  /**
   * Called for every newer update — and after every reconnect, because updates
   * sent while offline are not replayed. Re-read the data over REST here.
   */
  readonly onChange: (update: ParcelUpdate | null) => void
}

/**
 * Follows one parcel live. Pages keep loading data over REST as before; this
 * hook only tells them *when* to re-read it, so REST stays the single source of
 * truth and stale or duplicate updates are ignored (by `sequence`).
 *
 * ```tsx
 * const { state } = useParcelRealtime({
 *   subscription: parcel ? { scope: 'parcel', parcelId: parcel.id } : null,
 *   onChange: refresh,
 * })
 * ```
 */
export function useParcelRealtime({ subscription, onChange }: UseParcelRealtimeOptions): {
  readonly state: RealtimeState
} {
  // Reported only while there is something to follow (see the return value).
  const [state, setState] = useState<RealtimeState>('connecting')
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Re-subscribe only when the target actually changes, not on every render.
  const key = subscription
    ? subscription.scope === 'parcel'
      ? `parcel:${subscription.parcelId}`
      : `public:${subscription.trackingNumber.trim().toUpperCase()}`
    : null

  useEffect(() => {
    const target = subscriptionFromKey(key)
    if (!target) return
    const socket = acquireSocket()
    let last: { sequence: number } | null = null
    let everConnected = false

    const subscribe = () => {
      socket
        .timeout(5_000)
        .emitWithAck(RealtimeClientEvent.SUBSCRIBE, target)
        .then((ack: RealtimeAck) => setState(ack.ok ? 'live' : 'off'))
        .catch(() => setState('reconnecting'))
    }
    const onConnect = () => {
      subscribe()
      // After a reconnect the page may have missed updates: re-read once.
      if (everConnected) onChangeRef.current(null)
      everConnected = true
    }
    const onDisconnect = () => setState('reconnecting')
    const matches = (update: ParcelUpdate) =>
      target.scope === 'parcel'
        ? 'parcelId' in update && update.parcelId === target.parcelId
        : update.trackingNumber === target.trackingNumber.trim().toUpperCase()
    const onUpdate = (update: ParcelUpdate) => {
      if (!matches(update) || !isNewerUpdate(last, update)) return
      last = update
      onChangeRef.current(update)
    }
    const event =
      target.scope === 'parcel'
        ? RealtimeServerEvent.PARCEL_UPDATED
        : RealtimeServerEvent.PUBLIC_PARCEL_UPDATED

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on(event, onUpdate)
    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off(event, onUpdate)
      if (socket.connected) socket.emit(RealtimeClientEvent.UNSUBSCRIBE, target)
      releaseSocket()
    }
    // Depends on `key` only: it identifies the subscription, so a new object
    // with the same target (every render) does not re-subscribe.
  }, [key])

  return { state: key ? state : 'off' }
}

/** Inverse of the `key` built above. */
function subscriptionFromKey(key: string | null): RealtimeSubscription | null {
  if (!key) return null
  const separator = key.indexOf(':')
  const scope = key.slice(0, separator)
  const value = key.slice(separator + 1)
  return scope === 'parcel'
    ? { scope: 'parcel', parcelId: value }
    : { scope: 'public', trackingNumber: value }
}

/**
 * For role screens (courier, merchant, dispatcher): the server already puts
 * the socket in the user's room, which receives every update for their
 * parcels. Calls `onChange` (debounced) for any update and after reconnects —
 * e.g. to reload a delivery list.
 */
export function useLiveParcelEvents(
  onChange: () => void,
  { enabled = true, debounceMs = 400 }: { enabled?: boolean; debounceMs?: number } = {},
): { readonly state: RealtimeState } {
  // Reported only while there is something to follow (see the return value).
  const [state, setState] = useState<RealtimeState>('connecting')
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled) return
    const socket = acquireSocket()
    let timer: ReturnType<typeof setTimeout> | undefined
    let everConnected = false
    const changed = () => {
      clearTimeout(timer)
      timer = setTimeout(() => onChangeRef.current(), debounceMs)
    }
    const onConnect = () => {
      setState('live')
      if (everConnected) changed()
      everConnected = true
    }
    const onDisconnect = () => setState('reconnecting')

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on(RealtimeServerEvent.PARCEL_UPDATED, changed)
    if (socket.connected) onConnect()
    return () => {
      clearTimeout(timer)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off(RealtimeServerEvent.PARCEL_UPDATED, changed)
      releaseSocket()
    }
  }, [enabled, debounceMs])

  return { state: enabled ? state : 'off' }
}
