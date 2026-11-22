import { io, type Socket } from 'socket.io-client'
import { REALTIME_SOCKET_PATH } from '@swiftdrop/contracts'
import { env } from '../env'

/**
 * One Socket.IO connection per browser tab, shared by every component that
 * shows live updates. It opens with the first user and closes 5 s after the
 * last one leaves (so navigating between pages doesn't reconnect).
 *
 * Sign-in uses the same httpOnly cookie as fetch(…, { credentials: 'include' }).
 */

let socket: Socket | null = null
let users = 0
let closeTimer: ReturnType<typeof setTimeout> | undefined

/** Server origin of the API, e.g. http://localhost:4000 (also for a relative VITE_API_BASE_URL). */
export function apiOrigin(apiBaseUrl: string = env.apiBaseUrl): string {
  return new URL(apiBaseUrl, window.location.origin).origin
}

export function acquireSocket(): Socket {
  clearTimeout(closeTimer)
  users += 1
  if (!socket) {
    socket = io(apiOrigin(), {
      path: REALTIME_SOCKET_PATH,
      transports: ['websocket'],
      withCredentials: true,
      reconnectionDelayMax: 10_000,
    })
    // The server closes the socket when the access token expires. Socket.IO
    // does not reconnect after a server-side disconnect, so do it here; the
    // page's own REST calls refresh the session in the meantime.
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        setTimeout(() => socket?.connect(), 1_000)
      }
    })
  }
  return socket
}

export function releaseSocket(): void {
  users = Math.max(0, users - 1)
  if (users > 0) return
  closeTimer = setTimeout(() => {
    if (users === 0) {
      socket?.disconnect()
      socket = null
    }
  }, 5_000)
}
