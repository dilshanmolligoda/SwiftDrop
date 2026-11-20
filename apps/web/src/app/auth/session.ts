import { createContext, useContext } from 'react'

/** Mirrors the API's `UserProfile` returned by `GET /auth/me`. */
export type UserRole = 'CUSTOMER' | 'MERCHANT' | 'COURIER' | 'DISPATCHER' | 'ADMIN'

export interface SessionUser {
  readonly id: string
  readonly email: string
  readonly fullName: string
  readonly role: UserRole
  readonly approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  readonly isActive: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SessionContextValue {
  readonly user: SessionUser
  /** Ends the cookie session on the server and returns to the login page. */
  readonly signOut: () => Promise<void>
  /** Call when an API request returns 401 so the user is sent back to login. */
  readonly onSessionExpired: () => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used inside a RequireRole route')
  }
  return context
}
