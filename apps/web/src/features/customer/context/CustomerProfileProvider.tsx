import React, { useEffect, useState } from 'react'
import { env } from '../../../lib/env'
import {
  type CustomerProfile,
  CustomerProfileContext,
} from './CustomerProfileContext'

const STORAGE_KEY = 'swiftdrop_customer_profile'

const DEFAULT_PROFILE: CustomerProfile = {
  fullName: 'Jane Doe',
  email: 'jane.doe@email.com',
  phoneNumber: '+94 77 123 4567',
  initials: 'JD',
  notifications: {
    isEmailUpdatesEnabled: true,
    isSmsUpdatesEnabled: false,
  },
}

/**
 * Computes 1 or 2 letter uppercase initials from a person's full name.
 * Example: "Nimradha Nethmini" -> "NN", "Jane" -> "J", "" -> "SD"
 */
const computeUserInitials = (name: string): string => {
  const trimmed = name.trim()
  if (!trimmed) {
    return 'SD'
  }

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }

  const firstInitial = parts[0].charAt(0).toUpperCase()
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase()
  return `${firstInitial}${lastInitial}`
}

/**
 * Provides persistent customer profile state across layout, topbar, and settings.
 * Synchronizes changes to localStorage for session persistence.
 */
export const CustomerProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<CustomerProfile>(() => {
    try {
      const persistedJson = localStorage.getItem(STORAGE_KEY)
      if (persistedJson) {
        const parsed = JSON.parse(persistedJson) as Partial<CustomerProfile>
        const fullName = parsed.fullName || DEFAULT_PROFILE.fullName
        return {
          fullName,
          email: parsed.email || DEFAULT_PROFILE.email,
          phoneNumber: parsed.phoneNumber || DEFAULT_PROFILE.phoneNumber,
          initials: computeUserInitials(fullName),
          notifications: {
            isEmailUpdatesEnabled:
              parsed.notifications?.isEmailUpdatesEnabled ??
              DEFAULT_PROFILE.notifications.isEmailUpdatesEnabled,
            isSmsUpdatesEnabled:
              parsed.notifications?.isSmsUpdatesEnabled ??
              DEFAULT_PROFILE.notifications.isSmsUpdatesEnabled,
          },
        }
      }
    } catch {
      // Fallback to default profile if localStorage read or JSON parse fails
    }
    return DEFAULT_PROFILE
  })

  // Keep state synced to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    } catch {
      // Handle storage quota exceeded or private browsing restrictions gracefully
    }
  }, [profile])

  // Automatically sync with authenticated backend session if available
  useEffect(() => {
    let isMounted = true
    const syncWithBackendSession = async (): Promise<void> => {
      try {
        const response = await fetch(`${env.apiBaseUrl}/auth/me`, {
          credentials: 'include',
        })
        if (response.ok && isMounted) {
          const user = (await response.json()) as {
            fullName?: string
            email?: string
            role?: string
            isGoogleLinked?: boolean
          }
          if (user?.fullName) {
            setProfile((prev) => ({
              ...prev,
              fullName: user.fullName || prev.fullName,
              email: user.email || prev.email,
              role: user.role || prev.role,
              isGoogleLinked: user.isGoogleLinked ?? prev.isGoogleLinked,
              initials: computeUserInitials(user.fullName || prev.fullName),
            }))
          }
        }
      } catch {
        // Fallback to local profile silently if offline
      }
    }
    void syncWithBackendSession()
    return () => {
      isMounted = false
    }
  }, [])

  const updateProfile = (updatedFields: Partial<Omit<CustomerProfile, 'initials'>>): void => {
    setProfile((previousProfile) => {
      const nextFullName =
        updatedFields.fullName !== undefined ? updatedFields.fullName : previousProfile.fullName
      const nextEmail =
        updatedFields.email !== undefined ? updatedFields.email : previousProfile.email
      const nextPhone =
        updatedFields.phoneNumber !== undefined ? updatedFields.phoneNumber : previousProfile.phoneNumber
      const nextNotifications =
        updatedFields.notifications !== undefined
          ? { ...previousProfile.notifications, ...updatedFields.notifications }
          : previousProfile.notifications

      return {
        fullName: nextFullName,
        email: nextEmail,
        phoneNumber: nextPhone,
        initials: computeUserInitials(nextFullName),
        notifications: nextNotifications,
      }
    })
  }

  return (
    <CustomerProfileContext.Provider value={{ profile, updateProfile }}>
      {children}
    </CustomerProfileContext.Provider>
  )
}
