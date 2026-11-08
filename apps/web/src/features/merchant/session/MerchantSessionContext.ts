import { createContext, useContext } from 'react'
import type { AuthenticatedUser } from './session.api'

export interface MerchantSession {
  readonly user: AuthenticatedUser
  readonly signOut: () => Promise<void>
}

export const MerchantSessionContext = createContext<MerchantSession | null>(null)

/** The signed-in merchant. Only usable inside MerchantLayout, which verifies the session once. */
export function useMerchantSession(): MerchantSession {
  const session = useContext(MerchantSessionContext)
  if (!session) {
    throw new Error('useMerchantSession must be used inside MerchantLayout')
  }
  return session
}
