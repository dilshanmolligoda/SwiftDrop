import React, { useState } from 'react'
import {
  Home,
  Package,
  Search,
  BookOpen,
  Bell,
  HelpCircle,
  Settings,
  LogOut,
  Plus,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useCustomerProfile } from '../context/useCustomerProfile'
import './CustomerLayout.css'

interface NavigationItem {
  readonly label: string
  readonly path: string
  readonly icon: React.ComponentType<{ className?: string }>
}

const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { label: 'Dashboard', path: '/customer/dashboard', icon: Home },
  { label: 'My deliveries', path: '/customer/deliveries', icon: Package },
  { label: 'Track a parcel', path: '/track', icon: Search },
  { label: 'Address book', path: '/customer/addresses', icon: BookOpen },
  { label: 'Notifications', path: '/customer/notifications', icon: Bell },
  { label: 'Help & support', path: '/customer/support', icon: HelpCircle },
  { label: 'Settings', path: '/settings', icon: Settings },
]

interface CustomerLayoutProps {
  readonly children: React.ReactNode
}

/**
 * CustomerLayout shell providing the persistent responsive sidebar,
 * top navigation bar with breadcrumbs, and user session controls.
 */
export const CustomerLayout: React.FC<CustomerLayoutProps> = ({ children }) => {
  const location = useLocation()
  const { profile } = useCustomerProfile()
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  const activePath = location.pathname

  const toggleMobileSidebar = (): void => {
    setIsMobileSidebarOpen((previousState) => !previousState)
  }

  const closeMobileSidebar = (): void => {
    setIsMobileSidebarOpen(false)
  }

  const toggleUserMenu = (): void => {
    setIsUserMenuOpen((previousState) => !previousState)
  }

  const handleLogout = (): void => {
    // In a real flow, clear tokens and redirect to login
    alert('Logged out successfully.')
  }

  const getBreadcrumbTitle = (path: string): string => {
    if (path.includes('addresses')) return 'Address book'
    if (path.includes('settings')) return 'Settings'
    if (path.includes('deliveries')) return 'My deliveries'
    if (path.includes('create-delivery')) return 'Create delivery'
    if (path.includes('track')) return 'Track a parcel'
    if (path.includes('notifications')) return 'Notifications'
    if (path.includes('support')) return 'Help & support'
    return 'Dashboard'
  }

  return (
    <div className="customer-layout">
      {/* Mobile Drawer Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="customer-layout__backdrop"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      {/* Persistent Left Sidebar */}
      <aside
        className={`customer-sidebar ${
          isMobileSidebarOpen ? 'customer-sidebar--mobile-open' : ''
        }`}
      >
        <div className="customer-sidebar__header">
          <Link to="/" className="customer-sidebar__brand" onClick={closeMobileSidebar}>
            <div className="customer-sidebar__logo-icon">
              {/* SwiftDrop 3D Cube Icon */}
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="SwiftDrop Logo">
                <path
                  d="M16 3L28 9.5V22.5L16 29L4 22.5V9.5L16 3Z"
                  stroke="#0d5e36"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M16 3V16M16 16L28 9.5M16 16L4 9.5"
                  stroke="#0d5e36"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M16 16L16 29"
                  stroke="#0d5e36"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="customer-sidebar__brand-name">SwiftDrop</span>
          </Link>

          <button
            type="button"
            className="customer-sidebar__close-btn"
            onClick={closeMobileSidebar}
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="customer-sidebar__action">
          <Link
            to="/customer/create-delivery"
            className="customer-sidebar__create-btn"
            onClick={closeMobileSidebar}
          >
            <Plus className="w-4 h-4" />
            <span>Create delivery</span>
          </Link>
        </div>

        <nav className="customer-sidebar__nav" aria-label="Customer Navigation">
          <ul className="customer-sidebar__nav-list">
            {NAVIGATION_ITEMS.map((item) => {
              const IconComponent = item.icon
              const isItemActive =
                activePath === item.path ||
                (item.path === '/settings' && (activePath === '/settings' || activePath === '/customer/settings'))

              return (
                <li key={item.path} className="customer-sidebar__nav-item">
                  <Link
                    to={item.path}
                    onClick={closeMobileSidebar}
                    className={`customer-sidebar__nav-link ${
                      isItemActive ? 'customer-sidebar__nav-link--active' : ''
                    }`}
                  >
                    <IconComponent className="customer-sidebar__nav-icon" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="customer-sidebar__footer">
          <div className="customer-sidebar__user-card">
            <div className="customer-sidebar__avatar">{profile.initials}</div>
            <div className="customer-sidebar__user-details">
              <span className="customer-sidebar__user-name">{profile.fullName}</span>
              <span className="customer-sidebar__user-email">{profile.email}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="customer-sidebar__logout-btn"
          >
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="customer-layout__main">
        {/* Top Navigation Bar */}
        <header className="customer-topbar">
          <div className="customer-topbar__left">
            <button
              type="button"
              className="customer-topbar__menu-btn"
              onClick={toggleMobileSidebar}
              aria-label="Open navigation sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="customer-topbar__breadcrumbs">
              <Link to="/customer/dashboard" className="customer-topbar__breadcrumb-home">
                <Home className="w-4 h-4 text-slate-500" />
              </Link>
              <span className="customer-topbar__breadcrumb-separator">&gt;</span>
              <span className="customer-topbar__breadcrumb-current">
                {getBreadcrumbTitle(activePath)}
              </span>
            </div>
          </div>

          <div className="customer-topbar__right">
            <button
              type="button"
              className="customer-topbar__icon-btn"
              aria-label="View notifications"
            >
              <Bell className="w-4 h-4 text-slate-600" />
            </button>

            <div className="customer-topbar__user-wrapper">
              <button
                type="button"
                className="customer-topbar__user-chip"
                onClick={toggleUserMenu}
                aria-expanded={isUserMenuOpen}
              >
                <div className="customer-topbar__user-avatar">{profile.initials}</div>
                <span className="customer-topbar__user-name">{profile.fullName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {isUserMenuOpen && (
                <div className="customer-topbar__dropdown-menu">
                  <div className="customer-topbar__dropdown-header">
                    <p className="customer-topbar__dropdown-user">{profile.fullName}</p>
                    <p className="customer-topbar__dropdown-email">{profile.email}</p>
                  </div>
                  <Link
                    to="/settings"
                    className="customer-topbar__dropdown-item"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Account Settings
                  </Link>
                  <button
                    type="button"
                    className="customer-topbar__dropdown-item customer-topbar__dropdown-item--danger"
                    onClick={() => {
                      setIsUserMenuOpen(false)
                      handleLogout()
                    }}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Outlet */}
        <main className="customer-layout__content">{children}</main>
      </div>
    </div>
  )
}
