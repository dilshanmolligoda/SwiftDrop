import React, { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { DEFAULT_ADMIN_USER } from '../../features/admin/config/admin-nav.config'
import styles from './AdminLayout.module.css'

export const AdminLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Format breadcrumb from active URL pathname
  const currentPath = location.pathname.split('/').filter(Boolean).pop() || 'Dashboard'
  const currentTitle = currentPath.charAt(0).toUpperCase() + currentPath.slice(1)

  return (
    <div className={styles.layoutContainer}>
      <Sidebar isOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

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

            {/* Breadcrumb matching image */}
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              <span className={styles.breadcrumbHome}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </span>
              <span className={styles.breadcrumbSeparator}>›</span>
              <span className={styles.breadcrumbCurrent}>{currentTitle}</span>
            </nav>
          </div>

          <div className={styles.headerRight}>
            <button type="button" className={styles.iconButton} aria-label="Notifications">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>

            <div className={styles.userDropdown}>
              <div className={styles.smallAvatar}>{DEFAULT_ADMIN_USER.initials}</div>
              <span className={styles.userFullName}>{DEFAULT_ADMIN_USER.fullName}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </header>

        <main className={styles.contentArea}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

