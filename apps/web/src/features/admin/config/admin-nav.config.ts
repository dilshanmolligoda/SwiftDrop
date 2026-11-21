export interface NavItem {
  readonly id: string
  readonly label: string
  readonly path: string
  readonly icon: 'dashboard' | 'deliveries' | 'couriers' | 'users' | 'zones' | 'reports' | 'settings'
  readonly badge?: string | number
}

export interface AdminUserProfile {
  readonly fullName: string
  readonly role: string
  readonly initials: string
  readonly avatarUrl?: string
}

export const ADMIN_NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard' },
  { id: 'deliveries', label: 'Deliveries', path: '/admin/deliveries', icon: 'deliveries' },
  { id: 'couriers', label: 'Couriers', path: '/admin/couriers', icon: 'couriers' },
  { id: 'users', label: 'Users & approvals', path: '/admin/users', icon: 'users', badge: 4 },
  { id: 'zones', label: 'Zones & pricing', path: '/admin/pricing', icon: 'zones' },
  { id: 'reports', label: 'Reports', path: '/admin/reports', icon: 'reports' },
  { id: 'settings', label: 'Settings', path: '/admin/settings', icon: 'settings' },
] as const

export const DEFAULT_ADMIN_USER: AdminUserProfile = {
  fullName: 'Anjali Perera',
  role: 'Dispatcher',
  initials: 'AP',
}

