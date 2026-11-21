import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { CalendarDays, LayoutDashboard, LogOut, Menu, Package, Settings, X, type LucideIcon } from 'lucide-react'
import { useSession } from '../../../app/auth/session'
import { SwiftDropLogo } from '../../auth/components/SwiftDropLogo'
import { formatToday, getInitials } from '../utils/format'
import './CourierLayout.css'

interface NavItem {
  readonly label: string
  readonly to: string
  readonly icon: LucideIcon
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', to: '/courier/dashboard', icon: LayoutDashboard },
  { label: 'My deliveries', to: '/courier/deliveries', icon: Package },
  { label: 'Settings', to: '/courier/settings', icon: Settings },
]

function getPageTitle(pathname: string): string {
  if (/^\/courier\/deliveries\/[^/]+/.test(pathname)) return 'Delivery details'
  if (pathname.startsWith('/courier/deliveries')) return 'My deliveries'
  if (pathname.startsWith('/courier/settings')) return 'Settings'
  return 'Dashboard'
}

/** Shell for every /courier page: sidebar navigation, top bar and page outlet. */
export function CourierLayout() {
  const { user, signOut } = useSession()
  const location = useLocation()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  useEffect(() => {
    if (!isDrawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDrawerOpen])

  const handleSignOut = async () => {
    setIsSigningOut(true)
    await signOut()
  }

  const closeDrawer = () => setIsDrawerOpen(false)
  const initials = getInitials(user.fullName)

  return (
    <div className="courier-shell">
      <a href="#courier-main" className="cp-skip-link">
        Skip to content
      </a>

      {isDrawerOpen && <div className="cp-backdrop" onClick={closeDrawer} aria-hidden="true" />}

      <aside
        id="courier-sidebar"
        className={`cp-sidebar ${isDrawerOpen ? 'cp-sidebar--open' : ''}`}
        aria-label="Courier navigation"
      >
        <div className="cp-sidebar__header">
          <NavLink to="/courier/dashboard" className="cp-sidebar__brand" onClick={closeDrawer}>
            <SwiftDropLogo size={26} />
            <span className="cp-sidebar__brand-tag">Courier portal</span>
          </NavLink>
          <button
            type="button"
            className="cp-icon-btn cp-sidebar__close"
            onClick={closeDrawer}
            aria-label="Close navigation menu"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <nav className="cp-sidebar__nav">
          <p className="cp-sidebar__section-label">Menu</p>
          <ul className="cp-sidebar__list">
            {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={closeDrawer}
                  className={({ isActive }) => `cp-sidebar__link ${isActive ? 'cp-sidebar__link--active' : ''}`}
                >
                  <Icon className="cp-sidebar__link-icon" aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="cp-sidebar__footer">
          <div className="cp-user-card">
            <span className="cp-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="cp-user-card__details">
              <span className="cp-user-card__name">{user.fullName}</span>
              <span className="cp-user-card__email">{user.email}</span>
            </span>
          </div>
          <button
            type="button"
            className="cp-btn cp-btn--ghost cp-btn--block"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
          >
            <LogOut aria-hidden="true" />
            <span>{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </aside>

      <div className="cp-main">
        <header className="cp-topbar">
          <div className="cp-topbar__left">
            <button
              type="button"
              className="cp-icon-btn cp-topbar__menu"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-controls="courier-sidebar"
              aria-expanded={isDrawerOpen}
            >
              <Menu aria-hidden="true" />
            </button>
            <p className="cp-topbar__title">{getPageTitle(location.pathname)}</p>
          </div>
          <div className="cp-topbar__right">
            <span className="cp-topbar__date">
              <CalendarDays aria-hidden="true" />
              {formatToday()}
            </span>
            <span className="cp-topbar__role">Courier</span>
            <span className="cp-avatar cp-avatar--sm" title={user.fullName} aria-hidden="true">
              {initials}
            </span>
          </div>
        </header>

        <main id="courier-main" className="cp-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
