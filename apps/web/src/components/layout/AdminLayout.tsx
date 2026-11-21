import React, { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
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
  const [retryCount, setRetryCount] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()

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

              <div className={styles.userDropdown}>
                <div className={styles.smallAvatar}>{initials}</div>
                <span className={styles.userFullName}>{user.fullName}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
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
