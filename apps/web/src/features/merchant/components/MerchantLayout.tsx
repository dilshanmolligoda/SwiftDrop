import React, { useEffect, useState } from 'react'
import { Bell, ChevronDown, Home } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { env } from '../../../lib/env'
import { MerchantSidebar } from './MerchantSidebar'
import './MerchantLayout.css'

interface MerchantUser {
  readonly fullName: string
  readonly role?: string
  readonly approvalStatus?: string
}

export const MerchantLayout: React.FC = () => {
  const [user, setUser] = useState<MerchantUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
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
      <MerchantSidebar merchantName={displayName} onLogout={() => void handleLogout()} />

      <div className="merchant-layout__main">
        <header className="merchant-topbar">
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
