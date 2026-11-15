import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  Truck,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Plus,
  X,
  Bell,
  ArrowRight,
} from 'lucide-react'
import { useCustomerDeliveries } from '../context/useCustomerDeliveries'
import { type CustomerDelivery } from '../context/CustomerDeliveryContext'
import './NotificationsPage.css'

export interface NotificationItem {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly trackingNumber: string
  readonly timestamp: string
  readonly timeCategory: 'TODAY' | 'YESTERDAY'
  readonly isUnread: boolean
  readonly type: 'out_for_delivery' | 'in_transit' | 'attention' | 'delivered' | 'created'
}

const READ_STORAGE_KEY = 'swiftdrop_notifications_read_v2'

function deriveNotifications(
  deliveries: readonly CustomerDelivery[],
  readIds: Set<string>,
): NotificationItem[] {
  const items: NotificationItem[] = []

  deliveries.forEach((delivery) => {
    const destination =
      delivery.recipientAddress.split(',').pop()?.trim() || delivery.recipientAddress
    const createdDate = new Date(delivery.createdAt)
    const isToday = new Date().toDateString() === createdDate.toDateString()
    const timeFormatted = createdDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    if (delivery.status === 'OUT_FOR_DELIVERY') {
      const id = `notif-${delivery.id}-out`
      items.push({
        id,
        title: 'Out for delivery',
        description: `${delivery.trackingNumber} is out for delivery to ${destination}.`,
        trackingNumber: delivery.trackingNumber,
        timestamp: isToday ? timeFormatted : 'Yesterday',
        timeCategory: isToday ? 'TODAY' : 'YESTERDAY',
        isUnread: !readIds.has(id),
        type: 'out_for_delivery',
      })
    } else if (delivery.status === 'IN_TRANSIT' || delivery.status === 'PICKED_UP') {
      const id = `notif-${delivery.id}-transit`
      items.push({
        id,
        title: delivery.status === 'PICKED_UP' ? 'Parcel picked up' : 'Parcel in transit',
        description: `${delivery.trackingNumber} is on its way to ${destination}.`,
        trackingNumber: delivery.trackingNumber,
        timestamp: isToday ? timeFormatted : 'Yesterday',
        timeCategory: isToday ? 'TODAY' : 'YESTERDAY',
        isUnread: !readIds.has(id),
        type: 'in_transit',
      })
    } else if (delivery.status === 'DELIVERED') {
      const id = `notif-${delivery.id}-delivered`
      items.push({
        id,
        title: 'Parcel delivered',
        description: `${delivery.trackingNumber} was delivered successfully.`,
        trackingNumber: delivery.trackingNumber,
        timestamp: isToday ? timeFormatted : 'Yesterday',
        timeCategory: isToday ? 'TODAY' : 'YESTERDAY',
        isUnread: !readIds.has(id),
        type: 'delivered',
      })
    } else if (delivery.status === 'FAILED' || delivery.status === 'RETURNED') {
      const id = `notif-${delivery.id}-attention`
      items.push({
        id,
        title: 'Delivery needs attention',
        description: `${delivery.trackingNumber} could not be delivered. Recipient unavailable.`,
        trackingNumber: delivery.trackingNumber,
        timestamp: isToday ? timeFormatted : 'Yesterday',
        timeCategory: isToday ? 'TODAY' : 'YESTERDAY',
        isUnread: !readIds.has(id),
        type: 'attention',
      })
    }

    // Every delivery has a creation confirmation notification
    const createdId = `notif-${delivery.id}-created`
    items.push({
      id: createdId,
      title: 'Delivery created',
      description: `Your delivery request ${delivery.trackingNumber} has been confirmed.`,
      trackingNumber: delivery.trackingNumber,
      timestamp: isToday ? timeFormatted : 'Yesterday',
      timeCategory: isToday ? 'TODAY' : 'YESTERDAY',
      isUnread: !readIds.has(createdId),
      type: 'created',
    })
  })

  return items
}

export const NotificationsPage: React.FC = () => {
  const { metrics, deliveries, openCreateModal } = useCustomerDeliveries()
  const navigate = useNavigate()

  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(READ_STORAGE_KEY)
      if (stored) {
        return new Set(JSON.parse(stored) as string[])
      }
    } catch {
      // Fallback
    }
    return new Set<string>()
  })

  const notifications = useMemo(() => {
    return deriveNotifications(deliveries, readIds)
  }, [deliveries, readIds])

  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all')
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null)

  const unreadCount = notifications.filter((n) => n.isUnread).length

  const handleMarkAllAsRead = (): void => {
    const allIds = new Set(notifications.map((n) => n.id))
    setReadIds(allIds)
    try {
      localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(allIds)))
    } catch {
      // Handle storage quota
    }
  }

  const handleNotificationClick = (item: NotificationItem): void => {
    if (item.isUnread) {
      setReadIds((prev) => {
        const next = new Set(prev)
        next.add(item.id)
        try {
          localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(next)))
        } catch {
          // Handle storage quota
        }
        return next
      })
    }
    setSelectedNotification(item)
  }

  const filteredNotifications = notifications.filter((item) => {
    if (activeTab === 'unread') return item.isUnread
    return true
  })

  const todayItems = filteredNotifications.filter((item) => item.timeCategory === 'TODAY')
  const yesterdayItems = filteredNotifications.filter((item) => item.timeCategory === 'YESTERDAY')

  const renderIcon = (type: NotificationItem['type']): React.ReactNode => {
    switch (type) {
      case 'out_for_delivery':
        return (
          <div className="notif-icon-circle notif-icon-circle--green">
            <Truck className="w-4 h-4 text-emerald-800" />
          </div>
        )
      case 'in_transit':
        return (
          <div className="notif-icon-circle notif-icon-circle--green">
            <Package className="w-4 h-4 text-emerald-800" />
          </div>
        )
      case 'attention':
        return (
          <div className="notif-icon-circle notif-icon-circle--orange">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
        )
      case 'delivered':
        return (
          <div className="notif-icon-circle notif-icon-circle--green">
            <CheckCircle className="w-4 h-4 text-emerald-800" />
          </div>
        )
      case 'created':
      default:
        return (
          <div className="notif-icon-circle notif-icon-circle--green">
            <Package className="w-4 h-4 text-emerald-800" />
          </div>
        )
    }
  }

  return (
    <div className="notifications-page">
      {/* Page Header */}
      <div className="notifications-header">
        <div className="notifications-header__left">
          <h1 className="notifications-header__title">Notifications</h1>
          <p className="notifications-header__subtitle">Stay up to date with your deliveries.</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="notifications-header__cta-btn"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          <span>Create delivery</span>
        </button>
      </div>

      {/* Row of 3 Metric Cards */}
      <section className="notifications-metrics" aria-label="Delivery Summary">
        <article className="notif-metric-card">
          <div className="notif-metric-card__icon-wrapper notif-metric-card__icon-wrapper--green">
            <Package className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="notif-metric-card__content">
            <span className="notif-metric-card__label">Active deliveries</span>
            <span className="notif-metric-card__value">{metrics.activeDeliveries ?? 0}</span>
          </div>
        </article>

        <article className="notif-metric-card">
          <div className="notif-metric-card__icon-wrapper notif-metric-card__icon-wrapper--green">
            <Truck className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="notif-metric-card__content">
            <span className="notif-metric-card__label">Delivered this month</span>
            <span className="notif-metric-card__value">{metrics.deliveredThisMonth ?? 0}</span>
          </div>
        </article>

        <article className="notif-metric-card">
          <div className="notif-metric-card__icon-wrapper notif-metric-card__icon-wrapper--orange">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="notif-metric-card__content">
            <span className="notif-metric-card__label">Needs attention</span>
            <span className="notif-metric-card__value">{metrics.needsAttention ?? 0}</span>
          </div>
        </article>
      </section>

      {/* Main Notifications Card */}
      <section className="notifications-main-card" aria-label="Notifications Feed">
        {/* Tab Navigation Header */}
        <div className="notifications-tabs-bar">
          <div className="notifications-tabs-left">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`notif-tab-btn ${activeTab === 'all' ? 'notif-tab-btn--active' : ''}`}
            >
              <span>All</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              className={`notif-tab-btn ${activeTab === 'unread' ? 'notif-tab-btn--active' : ''}`}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="notif-unread-count-pill">{unreadCount}</span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0}
            className="notif-mark-read-btn"
          >
            Mark all as read
          </button>
        </div>

        {/* Notification Feed Body */}
        <div className="notifications-feed">
          {filteredNotifications.length === 0 ? (
            <div className="notifications-empty-state">
              <div className="notifications-empty-icon">
                <Bell className="w-8 h-8 text-emerald-700" />
              </div>
              <h3 className="notifications-empty-title">
                {notifications.length === 0 ? 'No notifications yet' : 'All caught up!'}
              </h3>
              <p className="notifications-empty-subtitle">
                {notifications.length === 0
                  ? 'When you schedule a delivery or receive tracking updates, your notifications will appear here.'
                  : 'You have no unread delivery notifications at the moment.'}
              </p>
            </div>
          ) : (
            <>
              {/* TODAY Section */}
              {todayItems.length > 0 && (
                <div className="notifications-group">
                  <h3 className="notifications-group__heading">TODAY</h3>
                  <div className="notifications-list">
                    {todayItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleNotificationClick(item)}
                        className={`notif-item ${item.isUnread ? 'notif-item--unread' : ''}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleNotificationClick(item)
                        }}
                      >
                        {/* Left dot column */}
                        <div className="notif-item__dot-col">
                          {item.isUnread && <span className="notif-item__dot" />}
                        </div>

                        {/* Icon */}
                        {renderIcon(item.type)}

                        {/* Center text */}
                        <div className="notif-item__body">
                          <h4 className="notif-item__title">{item.title}</h4>
                          <p className="notif-item__desc">{item.description}</p>
                        </div>

                        {/* Right timestamp & chevron */}
                        <div className="notif-item__meta">
                          <span className="notif-item__time">{item.timestamp}</span>
                          <ChevronRight className="notif-item__chevron" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* YESTERDAY Section */}
              {yesterdayItems.length > 0 && (
                <div className="notifications-group">
                  <h3 className="notifications-group__heading">YESTERDAY</h3>
                  <div className="notifications-list">
                    {yesterdayItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleNotificationClick(item)}
                        className={`notif-item ${item.isUnread ? 'notif-item--unread' : ''}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleNotificationClick(item)
                        }}
                      >
                        {/* Left dot column */}
                        <div className="notif-item__dot-col">
                          {item.isUnread && <span className="notif-item__dot" />}
                        </div>

                        {/* Icon */}
                        {renderIcon(item.type)}

                        {/* Center text */}
                        <div className="notif-item__body">
                          <h4 className="notif-item__title">{item.title}</h4>
                          <p className="notif-item__desc">{item.description}</p>
                        </div>

                        {/* Right timestamp & chevron */}
                        <div className="notif-item__meta">
                          <span className="notif-item__time">{item.timestamp}</span>
                          <ChevronRight className="notif-item__chevron" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------
       * Notification Details Modal
       * ------------------------------------------------------------- */}
      {selectedNotification && (
        <div className="modal-backdrop" onClick={() => setSelectedNotification(null)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notif-modal-title"
          >
            <div className="modal-header">
              <div className="flex items-center gap-2">
                {renderIcon(selectedNotification.type)}
                <div>
                  <h3 id="notif-modal-title" className="modal-title">
                    {selectedNotification.title}
                  </h3>
                  <p className="modal-subtitle">{selectedNotification.timestamp}</p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedNotification(null)}
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              <p className="text-sm text-slate-700 leading-relaxed mb-4">
                {selectedNotification.description}
              </p>

              <div className="modal-info-grid">
                <div className="modal-info-item">
                  <span className="modal-info-label">Tracking Number</span>
                  <span className="modal-info-value font-mono">
                    {selectedNotification.trackingNumber}
                  </span>
                </div>

                <div className="modal-info-item">
                  <span className="modal-info-label">Notification Type</span>
                  <span className="modal-info-value uppercase text-xs">
                    {selectedNotification.type.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {selectedNotification.type === 'attention' && (
                <div className="modal-alert-box mt-4">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="text-xs">
                    Recipient was unreachable at destination. A retry has been automatically
                    scheduled for tomorrow morning.
                  </span>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className="modal-btn-secondary"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedNotification(null)
                  navigate('/customer/dashboard')
                }}
                className="modal-btn-primary"
              >
                <span>View on Dashboard</span>
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationsPage

