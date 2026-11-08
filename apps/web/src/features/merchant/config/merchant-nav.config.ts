import { KeyRound, LayoutDashboard, Package, Settings, Webhook, type LucideIcon } from 'lucide-react'

export interface MerchantNavItem {
  readonly label: string
  readonly path: string
  readonly icon: LucideIcon
}

export const MERCHANT_NAV_ITEMS: readonly MerchantNavItem[] = [
  { label: 'Dashboard', path: '/merchant/dashboard', icon: LayoutDashboard },
  { label: 'Orders', path: '/merchant/orders', icon: Package },
  { label: 'API keys', path: '/merchant/api-keys', icon: KeyRound },
  { label: 'Webhooks', path: '/merchant/webhooks', icon: Webhook },
  { label: 'Settings', path: '/merchant/settings', icon: Settings },
]
