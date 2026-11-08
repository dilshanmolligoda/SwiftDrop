import { env } from '../../../lib/env'

export type Role = 'CUSTOMER' | 'MERCHANT' | 'COURIER' | 'DISPATCHER' | 'ADMIN'
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

/** Shape returned by GET /auth/me. */
export interface AuthenticatedUser {
  readonly id: string
  readonly email: string
  readonly fullName: string
  readonly role: Role
  readonly approvalStatus: ApprovalStatus
  readonly isActive: boolean
  readonly isGoogleLinked?: boolean
  readonly createdAt: string
}

export type SessionResult =
  | { readonly status: 'authenticated'; readonly user: AuthenticatedUser }
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'error' }

/** Reads the current session from the HTTP-only cookie set at login. */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<SessionResult> {
  try {
    const response = await fetch(`${env.apiBaseUrl}/auth/me`, {
      method: 'GET',
      credentials: 'include',
      signal,
    })
    if (response.status === 401) return { status: 'unauthenticated' }
    if (!response.ok) return { status: 'error' }
    return { status: 'authenticated', user: (await response.json()) as AuthenticatedUser }
  } catch (error) {
    if (signal?.aborted) throw error
    return { status: 'error' }
  }
}

/** Clears the session cookie on the server. Errors are ignored: the user is signed out locally either way. */
export async function logout(): Promise<void> {
  try {
    await fetch(`${env.apiBaseUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } catch {
    // Network failure: still leave the dashboard
  }
}
