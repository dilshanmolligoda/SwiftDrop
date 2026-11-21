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
  const [state, setState] = useState<RealtimeState>('off')
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
    if (!key || !subscription) {
      setState('off')
      return
    }
    const target = subscription
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

    setState(socket.connected ? 'live' : 'connecting')
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
    // Depends on `key` only: it identifies `subscription`, so a new object with
    // the same target (every render) does not re-subscribe.
  }, [key])

  return { state }
}
