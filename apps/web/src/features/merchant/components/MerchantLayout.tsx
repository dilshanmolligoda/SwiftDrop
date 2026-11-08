import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu, Package2 } from 'lucide-react'
import { MERCHANT_NAV_ITEMS } from '../config/merchant-nav.config'
import { fetchCurrentUser, logout, type AuthenticatedUser } from '../session/session.api'
import { getInitials, resolveMerchantAccess } from '../session/merchant-access'
import { MerchantSessionContext, type MerchantSession } from '../session/MerchantSessionContext'
import styles from './MerchantLayout.module.css'

type GuardState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly user: AuthenticatedUser }

/**
 * Shell for every /merchant/* page. Verifies the cookie session once with
 * GET /auth/me when the portal opens; nested pages read the user from context
 * instead of fetching it again on every navigation.
 */
export const MerchantLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [state, setState] = useState<GuardState>({ kind: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  // useNavigate() returns a new function on every route change, so the session
  // check reads it from a ref. Otherwise moving between merchant pages would
  // call /auth/me again each time.
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    const controller = new AbortController()

    fetchCurrentUser(controller.signal)
      .then((result) => {
        if (result.status === 'unauthenticated') {
          navigateRef.current('/login', { replace: true })
          return
        }
        if (result.status === 'error') {
          setState({ kind: 'error' })
          return
        }
        const access = resolveMerchantAccess(result.user)
        if (!access.allowed) {
          navigateRef.current(access.redirectTo, { replace: true })
          return
        }
        setState({ kind: 'ready', user: result.user })
      })
      .catch(() => {
        // Aborted because the layout unmounted
      })

    return () => controller.abort()
  }, [attempt])

  const signOut = useCallback(async () => {
    setSigningOut(true)
    await logout()
    setState({ kind: 'checking' })
    navigate('/login', { replace: true })
  }, [navigate])

  const session = useMemo<MerchantSession | null>(
    () => (state.kind === 'ready' ? { user: state.user, signOut } : null),
    [state, signOut],
  )

  if (state.kind === 'checking') {
    return (
      <div className={styles.centerScreen} role="status">
        <div className={styles.spinner} aria-hidden="true" />
        <p>Checking your session…</p>
      </div>
    )
  }

  if (state.kind === 'error' || !session) {
    return (
      <div className={styles.centerScreen} role="alert">
        <p>We couldn't reach SwiftDrop to verify your session.</p>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            setState({ kind: 'checking' })
            setAttempt((n) => n + 1)
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  const { user } = session
  const initials = getInitials(user.fullName)
  const currentPage =
    MERCHANT_NAV_ITEMS.find((item) => location.pathname.startsWith(item.path))?.label ?? 'Dashboard'

  return (
    <MerchantSessionContext.Provider value={session}>
      <div className={styles.layout}>
        {mobileOpen && (
          <div className={styles.backdrop} onClick={() => setMobileOpen(false)} aria-hidden="true" />
        )}

        <aside
          className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}
          aria-label="Merchant navigation"
        >
          <div className={styles.brand}>
            <Package2 size={24} className={styles.brandIcon} aria-hidden="true" />
            <span className={styles.brandName}>SwiftDrop</span>
            <span className={styles.brandTag}>Merchant</span>
          </div>

          <nav className={styles.nav}>
            {MERCHANT_NAV_ITEMS.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className={styles.sidebarFooter}>
            <div className={styles.userCard}>
              <div className={styles.avatar} aria-hidden="true">{initials}</div>
              <div className={styles.userText}>
                <span className={styles.userName}>{user.fullName}</span>
                <span className={styles.userEmail}>{user.email}</span>
              </div>
            </div>
            <button
              type="button"
              className={styles.logoutButton}
              onClick={() => void signOut()}
              disabled={signingOut}
            >
              <LogOut size={18} aria-hidden="true" />
              <span>{signingOut ? 'Signing out…' : 'Log out'}</span>
            </button>
          </div>
        </aside>

        <div className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <button
                type="button"
                className={styles.menuButton}
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
              >
                <Menu size={22} />
              </button>
              <h1 className={styles.pageTitle}>{currentPage}</h1>
            </div>
            <div className={styles.headerUser}>
              <div className={styles.smallAvatar} aria-hidden="true">{initials}</div>
              <div className={styles.headerUserText}>
                <span className={styles.userName}>{user.fullName}</span>
                <span className={styles.roleTag}>Merchant</span>
              </div>
            </div>
          </header>

          <main className={styles.content}>
            <Outlet />
          </main>
        </div>
      </div>
    </MerchantSessionContext.Provider>
  )
}
