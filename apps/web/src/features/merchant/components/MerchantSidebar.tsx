import { useState } from 'react'
import { Box, ChevronDown, CirclePlus, FileText, Home, Link as LinkIcon, LogOut, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SwiftDropLogo } from '../../auth/components/SwiftDropLogo'
import styles from '../pages/MerchantDashboard.module.css'

type MerchantSidebarAction = 'dashboard' | 'orders' | 'coming-soon'

interface MerchantSidebarProps {
  readonly merchantName: string
  readonly onLogout: () => void
  readonly onAction?: (action: MerchantSidebarAction, label: string) => void
  readonly onCreateDelivery?: () => void
}

const navigationItems: readonly {
  label: string
  path: string
  icon: LucideIcon
  action: MerchantSidebarAction
}[] = [
  { label: 'Dashboard', path: '/merchant/dashboard', icon: Home, action: 'dashboard' },
  { label: 'Orders', path: '/merchant/orders', icon: Box, action: 'orders' },
  { label: 'Track a parcel', path: '/track', icon: LinkIcon, action: 'coming-soon' },
  { label: 'Pricing', path: '/merchant/pricing', icon: FileText, action: 'coming-soon' },
  { label: 'Store connections', path: '/merchant/connections', icon: LinkIcon, action: 'coming-soon' },
  { label: 'Settings', path: '/merchant/settings', icon: Settings, action: 'coming-soon' },
]

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function MerchantSidebar({
  merchantName,
  onLogout,
  onAction,
  onCreateDelivery,
}: MerchantSidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const initials = getInitials(merchantName) || 'M'

  const handleAction = (item: (typeof navigationItems)[number]) => {
    if (onAction) {
      onAction(item.action, item.label)
      return
    }

    navigate(item.path)
  }

  return (
    <aside className={styles.sidebar} aria-label="Merchant navigation">
      <div className={styles.brand}>
        <SwiftDropLogo size={24} />
      </div>

      <button type="button" className={styles.createButton} onClick={onCreateDelivery ?? (() => navigate('/merchant/create-delivery'))}>
        <CirclePlus size={16} aria-hidden="true" />
        <span>Create delivery</span>
      </button>

      <nav className={styles.navigation}>
        {navigationItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path || (item.action === 'orders' && location.pathname.startsWith('/merchant/orders'))
          return (
            <button
              type="button"
              key={item.label}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => handleAction(item)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className={styles.sidebarAccount}>
        <button
          type="button"
          className={styles.accountButton}
          aria-expanded={isAccountMenuOpen}
          onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
        >
          <span className={styles.avatar}>{initials}</span>
          <span className={styles.accountText}>
            <strong>{merchantName}</strong>
            <small>Merchant account</small>
          </span>
          <ChevronDown size={15} className={isAccountMenuOpen ? styles.chevronUp : ''} aria-hidden="true" />
        </button>
        {isAccountMenuOpen && (
          <button type="button" className={styles.logoutButton} onClick={onLogout}>
            <LogOut size={15} aria-hidden="true" />
            <span>Log out</span>
          </button>
        )}
      </div>
    </aside>
  )
}
