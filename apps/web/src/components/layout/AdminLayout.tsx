import React, { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { env } from '../../lib/env'
import { Sidebar } from './Sidebar'
import {
  AdminAuthContext,
  type AuthenticatedUser,
} from '../../features/admin/context/AdminAuthContext'
import { getUserInitials } from '../../features/admin/utils/admin-auth.util'
import styles from './AdminLayout.module.css'

export const AdminLayout: React.FC = () => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const verifySession = async () => {
      try {
        const response = await fetch(`${env.apiBaseUrl}/auth/me`, {
          method: 'GET',
          credentials: 'include',
        })

        if (!isMounted) return

        if (response.status === 401) {
          navigate('/login', { replace: true })
          return
        }

        if (!response.ok) {
          setErrorMessage(`Session verification failed (HTTP ${response.status}).`)
          setIsLoading(false)
          return
        }

        const userProfile = (await response.json()) as AuthenticatedUser
        if (!isMounted) return

        // Approval status check
        if (userProfile.approvalStatus === 'PENDING' || userProfile.approvalStatus === 'REJECTED') {
          navigate('/application-status', { replace: true })
          return
        }

        // Role check: redirect if not ADMIN or DISPATCHER
        if (userProfile.role === 'CUSTOMER') {
          navigate('/customer/dashboard', { replace: true })
          return
        }

        if (userProfile.role === 'MERCHANT') {
          navigate('/merchant/dashboard', { replace: true })
          return
        }

        if (userProfile.role === 'COURIER') {
          navigate('/courier/dashboard', { replace: true })
          return
        }

        if (userProfile.role === 'ADMIN' || userProfile.role === 'DISPATCHER') {
          setUser(userProfile)
          setIsLoading(false)
          return
        }

        navigate('/login', { replace: true })
      } catch {
        if (isMounted) {
          setErrorMessage(
            'Unable to connect to SwiftDrop server. Please ensure the backend is running.',
          )
          setIsLoading(false)
        }
      }
    }

    void verifySession()

    return () => {
      isMounted = false
    }
  }, [navigate, retryCount])

  const handleRetry = () => {
    setIsLoading(true)
    setErrorMessage(null)
    setRetryCount((prev) => prev + 1)
  }

  const handleLogout = async () => {
    try {
      await fetch(`${env.apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Proceed even on network error to clear client session
    } finally {
      navigate('/login', { replace: true })
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.loadingScreen} role="status" aria-live="polite">
        <div className={styles.spinner} aria-hidden="true" />
        <p className={styles.loadingText}>Verifying session...</p>
      </div>
    )
  }

  // Network / verification error state
  if (errorMessage || !user) {
    return (
      <div className={styles.errorScreen}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Authentication Error</h2>
          <p className={styles.errorMessage}>{errorMessage || 'Session could not be established.'}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.retryButton}
              onClick={handleRetry}
            >
              Retry
            </button>
            <button
              type="button"
              className={styles.loginRedirectButton}
              onClick={() => navigate('/login', { replace: true })}
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Format breadcrumb from active URL pathname
  const currentPath = location.pathname.split('/').filter(Boolean).pop() || 'Dashboard'
  const currentTitle = currentPath.charAt(0).toUpperCase() + currentPath.slice(1)
  const initials = getUserInitials(user.fullName)

  return (
    <AdminAuthContext.Provider value={{ user, logout: handleLogout }}>
      <div className={styles.layoutContainer}>
        <Sidebar
          isOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          user={user}
          onLogout={handleLogout}
        />

        <div className={styles.mainWrapper}>
          <header className={styles.topHeader}>
            <div className={styles.headerLeft}>
              <button
                type="button"
                className={styles.mobileMenuButton}
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              {/* Breadcrumb matching design */}
              <nav className={styles.breadcrumb} aria-label="Breadcrumb">
                <span className={styles.breadcrumbHome} aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                </span>
                <span className={styles.breadcrumbSeparator} aria-hidden="true">›</span>
                <span className={styles.breadcrumbCurrent}>{currentTitle}</span>
              </nav>
            </div>

            <div className={styles.headerRight}>
              <button type="button" className={styles.iconButton} aria-label="Notifications">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </button>

              <div className={styles.profileMenuContainer} ref={profileMenuRef}>
                <button
                  type="button"
                  className={styles.userDropdown}
                  onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="true"
                  aria-label="User account menu"
                >
                  <div className={styles.smallAvatar}>{initials}</div>
                  <span className={styles.userFullName}>{user.fullName}</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                    className={isProfileMenuOpen ? styles.chevronRotated : ''}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isProfileMenuOpen && (
                  <div className={styles.profileDropdownMenu} role="menu">
                    <div className={styles.profileDropdownHeader}>
                      <div className={styles.dropdownAvatar}>{initials}</div>
                      <div className={styles.dropdownUserDetails}>
                        <span className={styles.dropdownUserName}>{user.fullName}</span>
                        <span className={styles.dropdownUserEmail}>{user.email}</span>
                        <span className={styles.dropdownRoleBadge}>
                          {user.role === 'DISPATCHER' ? 'Dispatcher' : 'Administrator'}
                        </span>
                      </div>
                    </div>

                    <div className={styles.dropdownDivider} />

                    <Link
                      to="/admin/settings"
                      className={styles.dropdownItem}
                      role="menuitem"
                      onClick={() => setIsProfileMenuOpen(false)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      Account Settings
                    </Link>

                    <button
                      type="button"
                      className={`${styles.dropdownItem} ${styles.dropdownLogoutButton}`}
                      role="menuitem"
                      onClick={() => {
                        setIsProfileMenuOpen(false)
                        void handleLogout()
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className={styles.contentArea}>
            <Outlet context={{ user }} />
          </main>
        </div>
      </div>
    </AdminAuthContext.Provider>
  )
}
export default AdminLayout
