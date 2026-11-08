import type { AuthenticatedUser, Role } from './session.api'

/** Where each role lands after login. Mirrors the redirects in LoginPage. */
const ROLE_HOME: Record<Role, string> = {
  CUSTOMER: '/customer/dashboard',
  MERCHANT: '/merchant/dashboard',
  COURIER: '/courier/dashboard',
  ADMIN: '/admin/dashboard',
  DISPATCHER: '/admin/dashboard',
}

export type MerchantAccess =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly redirectTo: string }

/** Decides whether a signed-in user may open the merchant portal. */
export function resolveMerchantAccess(user: AuthenticatedUser): MerchantAccess {
  if (user.approvalStatus === 'PENDING' || user.approvalStatus === 'REJECTED') {
    return { allowed: false, redirectTo: '/application-status' }
  }
  if (user.role !== 'MERCHANT') {
    return { allowed: false, redirectTo: ROLE_HOME[user.role] ?? '/login' }
  }
  return { allowed: true }
}

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}
