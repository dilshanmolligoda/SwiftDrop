import { createContext } from 'react'

export interface CustomerNotificationPreferences {
  isEmailUpdatesEnabled: boolean
  isSmsUpdatesEnabled: boolean
}

export interface CustomerProfile {
  fullName: string
  email: string
  phoneNumber: string
  initials: string
  role?: string
  isGoogleLinked?: boolean
  notifications: CustomerNotificationPreferences
}

export interface CustomerProfileContextValue {
  profile: CustomerProfile
  updateProfile: (updatedFields: Partial<Omit<CustomerProfile, 'initials'>>) => void
  refreshProfile: () => Promise<void>
  clearProfile: () => void
}

export const CustomerProfileContext = createContext<CustomerProfileContextValue | undefined>(undefined)
