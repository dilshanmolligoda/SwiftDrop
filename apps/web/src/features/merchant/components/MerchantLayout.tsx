import React, { useEffect, useState } from 'react'
import { Bell, ChevronDown, Home, Link as LinkIcon, LogOut, Menu, Package, Plus, Settings, Tag, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { env } from '../../../lib/env'
import './MerchantLayout.css'

interface MerchantUser {
  readonly fullName: string
  readonly role?: string
  readonly approvalStatus?: string
}

const navigationItems = [
  { label: 'Dashboard', path: '/merchant/dashboard', icon: Home },
  { label: 'Orders', path: '/merchant/orders', icon: Package },
  { label: 'Track a parcel', path: '/track', icon: LinkIcon },
  { label: 'Pricing', path: '/merchant/pricing', icon: Tag },
  { label: 'Store connections', path: '/merchant/connections', icon: LinkIcon },
  { label: 'Settings', path: '/merchant/settings', icon: Settings },
] as const

export const MerchantLayout: React.FC = () => {
  const [user, setUser] = useState<MerchantUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    const verifySession = async () => {
      try {
        const response = await fetch(`${env.apiBaseUrl}/auth/me`, {
          credentials: 'include',
        })

        if (!isMounted) return
        if (response.status === 401) {
          navigate('/login', { replace: true })
          return
        }

        if (response.ok) {
          const profile = (await response.json()) as MerchantUser
          if (profile.approvalStatus === 'PENDING' || profile.approvalStatus === 'REJECTED') {
            navigate('/application-status', { replace: true })
            return
          }
          if (profile.role && profile.role !== 'MERCHANT') {
            navigate('/login', { replace: true })
            return
          }
          setUser(profile)
        }
      } catch {
        if (isMounted) navigate('/login', { replace: true })
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void verifySession()
    return () => {
      isMounted = false
    }
  }, [navigate])

  const handleLogout = async () => {
    try {
      await fetch(`${env.apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      navigate('/login', { replace: true })
    }
  }

  if (isLoading) {
    return (
      <div className="merchant-layout__loading" role="status">
        <div className="merchant-layout__spinner" aria-hidden="true" />
        <span>Verifying session...</span>
      </div>
    )
  }

  const displayName = user?.fullName ?? 'GreenLeaf Store'
  const initials = displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const pageTitle = location.pathname.includes('orders') ? 'Orders' : 'Dashboard'

  return (
    <div className="merchant-layout">
      {isSidebarOpen && (
        <div
          className="merchant-layout__backdrop"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`merchant-sidebar ${isSidebarOpen ? 'merchant-sidebar--open' : ''}`}>
        <div className="merchant-sidebar__header">
          <Link to="/merchant/orders" className="merchant-sidebar__brand">
            <span className="merchant-sidebar__logo" aria-hidden="true"><Package size={22} /></span>
            <span>SwiftDrop</span>
          </Link>
          <button type="button" className="merchant-sidebar__close" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation">
            <X size={20} />
          </button>
        </div>

        <Link to="/merchant/create-delivery" className="merchant-sidebar__create">
          <Plus size={16} />
          <span>Create delivery</span>
        </Link>

        <nav className="merchant-sidebar__nav" aria-label="Merchant navigation">
          {navigationItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={({ isActive }) =>
                  `merchant-sidebar__nav-link ${isActive ? 'merchant-sidebar__nav-link--active' : ''}`
                }
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="merchant-sidebar__footer">
          <div className="merchant-sidebar__profile">
            <div className="merchant-sidebar__avatar">{initials}</div>
            <div>
              <strong>{displayName}</strong>
              <span>Merchant account</span>
            </div>
          </div>
          <button type="button" className="merchant-sidebar__logout" onClick={() => void handleLogout()}>
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="merchant-layout__main">
        <header className="merchant-topbar">
          <button type="button" className="merchant-topbar__menu" onClick={() => setIsSidebarOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <nav className="merchant-topbar__breadcrumbs" aria-label="Breadcrumb">
            <Home size={14} />
            <span>›</span>
            <strong>{pageTitle}</strong>
          </nav>
          <div className="merchant-topbar__right">
            <button type="button" className="merchant-topbar__icon" aria-label="Notifications"><Bell size={16} /></button>
            <button type="button" className="merchant-topbar__user">
              <span className="merchant-topbar__avatar">{initials}</span>
              <span>{displayName}</span>
              <ChevronDown size={13} />
            </button>
          </div>
        </header>
        <main className="merchant-layout__content"><Outlet /></main>
      </div>
    </div>
  )
}

export default MerchantLayout
