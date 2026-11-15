import React, { useState } from 'react'
import {
  Package,
  Truck,
  AlertTriangle,
  Search,
  ArrowRight,
  X,
  MapPin,
  Calendar,
} from 'lucide-react'
import { useCustomerDeliveries } from '../context/useCustomerDeliveries'
import { type CustomerDelivery, type DeliveryStatus } from '../context/CustomerDeliveryContext'
import './MyDeliveriesPage.css'

export const MyDeliveriesPage: React.FC = () => {
  const { metrics, deliveries } = useCustomerDeliveries()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DELIVERED' | 'ATTENTION'>('ALL')
  const [selectedDelivery, setSelectedDelivery] = useState<CustomerDelivery | null>(null)

  const filteredDeliveries = deliveries.filter((item) => {
    const matchesSearch =
      item.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.recipientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.recipientAddress.toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    if (statusFilter === 'ACTIVE') {
      return ['PENDING', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(item.status)
    }
    if (statusFilter === 'DELIVERED') {
      return item.status === 'DELIVERED'
    }
    if (statusFilter === 'ATTENTION') {
      return ['FAILED', 'RETURNED'].includes(item.status)
    }
    return true
  })

  const getBadgeClass = (status: DeliveryStatus): string => {
    switch (status) {
      case 'OUT_FOR_DELIVERY':
        return 'badge--out-for-delivery'
      case 'IN_TRANSIT':
      case 'PICKED_UP':
        return 'badge--in-transit'
      case 'DELIVERED':
        return 'badge--delivered'
      case 'FAILED':
      case 'RETURNED':
        return 'badge--failed'
      default:
        return 'badge--pending'
    }
  }

  const formatStatus = (status: DeliveryStatus): string => {
    switch (status) {
      case 'OUT_FOR_DELIVERY':
        return 'Out for delivery'
      case 'IN_TRANSIT':
        return 'In transit'
      case 'PICKED_UP':
        return 'Picked up'
      case 'DELIVERED':
        return 'Delivered'
      case 'FAILED':
        return 'Needs attention'
      case 'RETURNED':
        return 'Returned'
      default:
        return 'Pending pickup'
    }
  }

  return (
    <div className="my-deliveries-page">
      {/* Page Header */}
      <div className="my-deliveries-header">
        <div>
          <h1 className="my-deliveries-title">My deliveries</h1>
          <p className="my-deliveries-subtitle">Track, filter, and inspect all your parcel shipments</p>
        </div>
      </div>

      {/* Metrics Row */}
      <section className="my-deliveries-metrics" aria-label="Delivery Summary">
        <article className="deliv-metric-card">
          <div className="deliv-metric-card__icon-wrapper deliv-metric-card__icon-wrapper--green">
            <Package className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="deliv-metric-card__content">
            <span className="deliv-metric-card__label">Active deliveries</span>
            <span className="deliv-metric-card__value">{metrics.activeDeliveries ?? 0}</span>
          </div>
        </article>

        <article className="deliv-metric-card">
          <div className="deliv-metric-card__icon-wrapper deliv-metric-card__icon-wrapper--green">
            <Truck className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="deliv-metric-card__content">
            <span className="deliv-metric-card__label">Delivered this month</span>
            <span className="deliv-metric-card__value">{metrics.deliveredThisMonth ?? 0}</span>
          </div>
        </article>

        <article className="deliv-metric-card">
          <div className="deliv-metric-card__icon-wrapper deliv-metric-card__icon-wrapper--orange">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="deliv-metric-card__content">
            <span className="deliv-metric-card__label">Needs attention</span>
            <span className="deliv-metric-card__value">{metrics.needsAttention ?? 0}</span>
          </div>
        </article>
      </section>

      {/* Controls: Search & Tabs */}
      <div className="my-deliveries-controls">
        <div className="my-deliveries-search-wrapper">
          <Search className="my-deliveries-search-icon" />
          <input
            type="text"
            placeholder="Search by tracking number, recipient, address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="my-deliveries-search-input"
          />
        </div>

        <div className="my-deliveries-filter-tabs">
          <button
            type="button"
            className={`filter-tab ${statusFilter === 'ALL' ? 'filter-tab--active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            All ({deliveries.length})
          </button>
          <button
            type="button"
            className={`filter-tab ${statusFilter === 'ACTIVE' ? 'filter-tab--active' : ''}`}
            onClick={() => setStatusFilter('ACTIVE')}
          >
            Active ({metrics.activeDeliveries ?? 0})
          </button>
          <button
            type="button"
            className={`filter-tab ${statusFilter === 'DELIVERED' ? 'filter-tab--active' : ''}`}
            onClick={() => setStatusFilter('DELIVERED')}
          >
            Delivered ({metrics.deliveredThisMonth ?? 0})
          </button>
          <button
            type="button"
            className={`filter-tab ${statusFilter === 'ATTENTION' ? 'filter-tab--active' : ''}`}
            onClick={() => setStatusFilter('ATTENTION')}
          >
            Needs attention ({metrics.needsAttention ?? 0})
          </button>
        </div>
      </div>

      {/* Deliveries List */}
      <div className="my-deliveries-list">
        {filteredDeliveries.length === 0 ? (
          <div className="my-deliveries-empty">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="my-deliveries-empty-title">No deliveries found</h3>
            <p className="my-deliveries-empty-desc">
              {deliveries.length === 0
                ? "You haven't scheduled any deliveries yet."
                : 'No deliveries match your search or filter criteria.'}
            </p>
          </div>
        ) : (
          filteredDeliveries.map((delivery) => (
            <article key={delivery.id} className="delivery-row-card">
              <div className="delivery-row-main">
                <div className="delivery-row-header">
                  <span className="delivery-row-tracking">{delivery.trackingNumber}</span>
                  <span className={`badge ${getBadgeClass(delivery.status)}`}>
                    {formatStatus(delivery.status)}
                  </span>
                </div>

                <div className="delivery-row-details">
                  <div className="delivery-row-info-item">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>To: {delivery.recipientAddress} ({delivery.recipientName})</span>
                  </div>
                  <div className="delivery-row-info-item">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {delivery.packageSize} parcel · {delivery.weightKg} kg · LKR {delivery.costLkr.toLocaleString()}
                    </span>
                  </div>
                  <div className="delivery-row-info-item">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Booked: {new Date(delivery.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDelivery(delivery)}
                className="delivery-row-action-btn"
              >
                <span>View details</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </article>
          ))
        )}
      </div>

      {/* Delivery Details Modal */}
      {selectedDelivery && (
        <div className="modal-backdrop" onClick={() => setSelectedDelivery(null)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-modal-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="delivery-modal-title" className="modal-title">
                  {selectedDelivery.trackingNumber}
                </h3>
                <p className="modal-subtitle">Tracking details and courier status</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedDelivery(null)}
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-info-grid">
                <div className="modal-info-item">
                  <span className="modal-info-label">Status</span>
                  <span className={`badge ${getBadgeClass(selectedDelivery.status)}`}>
                    {formatStatus(selectedDelivery.status)}
                  </span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">Estimated Rate</span>
                  <span className="modal-info-value">LKR {selectedDelivery.costLkr.toLocaleString()}</span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">Package Size & Weight</span>
                  <span className="modal-info-value">
                    {selectedDelivery.packageSize} ({selectedDelivery.weightKg} kg)
                  </span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">Recipient Phone</span>
                  <span className="modal-info-value">{selectedDelivery.recipientPhone}</span>
                </div>
                <div className="modal-info-item modal-info-item--full">
                  <span className="modal-info-label">Delivery Destination</span>
                  <span className="modal-info-value">
                    {selectedDelivery.recipientAddress} ({selectedDelivery.recipientName})
                  </span>
                </div>
                <div className="modal-info-item modal-info-item--full">
                  <span className="modal-info-label">Pickup Origin</span>
                  <span className="modal-info-value">
                    {selectedDelivery.senderAddress} ({selectedDelivery.senderName})
                  </span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setSelectedDelivery(null)}
                className="modal-btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MyDeliveriesPage
