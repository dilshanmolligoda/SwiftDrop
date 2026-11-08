import { createContext, useContext } from 'react'

export interface AuthenticatedUser {
  id: string
  email: string
  fullName: string
  role: 'CUSTOMER' | 'MERCHANT' | 'COURIER' | 'DISPATCHER' | 'ADMIN'
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  isActive?: boolean
  isGoogleLinked?: boolean
}

export interface AdminAuthContextValue {
  user: AuthenticatedUser
  logout: () => Promise<void>
}

export const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export const useAdminAuth = (): AdminAuthContextValue => {
  const context = useContext(AdminAuthContext)
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider')
  }
  return context
}

