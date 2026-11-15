import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Package,
  Truck,
  AlertTriangle,
  Plus,
  Search,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  Bot,
  X,
  MapPin,
  ArrowRight,
  Send,
} from 'lucide-react'
import { useCustomerDeliveries } from '../context/useCustomerDeliveries'
import { type CustomerDelivery } from '../context/CustomerDeliveryContext'
import './CustomerDashboard.css'

function getInitialLinkNotice(): { type: 'success' | 'error'; message: string } | null {
  try {
    const searchParams = new URLSearchParams(window.location.search)
    const linkSuccess = searchParams.get('link_success')
    const linkError = searchParams.get('link_error')

    if (linkSuccess === 'google_connected') {
      return {
        type: 'success',
        message: 'Google account successfully connected!',
      }
    }
    if (linkError) {
      switch (linkError) {
        case 'email_mismatch':
          return {
            type: 'error',
            message:
              'Cannot link Google account: the Google email does not match your SwiftDrop account email.',
          }
        case 'google_already_linked':
          return {
            type: 'error',
            message: 'This Google identity is already connected to another SwiftDrop account.',
          }
        case 'already_has_google':
          return {
            type: 'error',
            message: 'Your account is already linked to a Google account.',
          }
        case 'access_denied':
          return {
            type: 'error',
            message: 'Google account linking was cancelled.',
          }
        default:
          return {
            type: 'error',
            message: 'Failed to connect Google account. Please try again.',
          }
      }
    }
  } catch {
    // URL parsing fallback
  }
  return null
}



export const CustomerDashboard: React.FC = () => {
  const { metrics, deliveries, openCreateModal } = useCustomerDeliveries()
  const [linkNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(
    getInitialLinkNotice,
  )

  // Tracking Search State
  const [trackingInput, setTrackingInput] = useState('')
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null)

  // Modal States
  const [selectedDelivery, setSelectedDelivery] = useState<CustomerDelivery | null>(null)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)

  // Assistant State
  const [assistantInput, setAssistantInput] = useState('')
  const [assistantMessages, setAssistantMessages] = useState<
    Array<{ sender: 'assistant' | 'user'; text: string }>
  >([
    {
      sender: 'assistant',
      text: 'Hello! I am your SwiftDrop Delivery Assistant. How can I help you today? You can ask about parcel rates, tracking updates, or pickup schedules.',
    },
  ])

  const handleTrackSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const query = trackingInput.trim().toUpperCase()
    if (!query) {
      setSearchFeedback('Please enter a tracking number.')
      return
    }

    const matched = deliveries.find(
      (item) => item.trackingNumber.toUpperCase() === query || item.id === query,
    )

    if (matched) {
      setSearchFeedback(null)
      setSelectedDelivery(matched)
    } else {
      setSearchFeedback(`No parcel found matching "${query}". Check your tracking code and try again.`)
    }
  }

  const handleAssistantSend = (textToSend?: string): void => {
    const text = (textToSend ?? assistantInput).trim()
    if (!text) return

    setAssistantMessages((prev) => [...prev, { sender: 'user', text }])
    if (!textToSend) setAssistantInput('')

    setTimeout(() => {
      let reply =
        'Thank you for your question. For immediate support or dispatch changes, you can also reach our dispatch desk at 011-234-5678.'
      const lower = text.toLowerCase()
      if (lower.includes('fee') || lower.includes('cost') || lower.includes('price')) {
        reply =
          'Standard delivery in Colombo starts at LKR 350 (under 1 kg). Island-wide deliveries start at LKR 650 with +LKR 100 per additional kg.'
      } else if (lower.includes('unavailable') || lower.includes('recipient') || lower.includes('matara')) {
        reply =
          'When a recipient is unavailable, our driver attempts redelivery twice within 24 hours. You can also reschedule delivery via the parcel details modal.'
      } else if (lower.includes('time') || lower.includes('how long')) {
        reply =
          'Same-day delivery is available within Western Province. Island-wide standard deliveries usually arrive within 1 to 2 business days.'
      }

      setAssistantMessages((prev) => [...prev, { sender: 'assistant', text: reply }])
    }, 400)
  }

  const activeDeliveriesList = deliveries.filter((d) =>
    ['PENDING', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(d.status),
  )
  const attentionDelivery = deliveries.find((d) => ['FAILED', 'RETURNED'].includes(d.status))

  return (
    <div className="customer-dashboard">
      {/* Top Header Row */}
      <div className="customer-dashboard__header">
        <div className="customer-dashboard__header-left">
          <h1 className="customer-dashboard__title">Your deliveries, at a glance</h1>
          <p className="customer-dashboard__subtitle">
            Track active parcels and plan your next delivery.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="customer-dashboard__cta-btn"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          <span>Create delivery</span>
        </button>
      </div>

      {/* Google OAuth Link Feedback Notification */}
      {linkNotice && (
        <div
          role="status"
          className={`customer-dashboard__alert ${
            linkNotice.type === 'success'
              ? 'customer-dashboard__alert--success'
              : 'customer-dashboard__alert--error'
          }`}
        >
          {linkNotice.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{linkNotice.message}</span>
        </div>
      )}

      {/* Dynamic Delivery Metric Cards */}
      <section className="customer-dashboard__metrics" aria-label="Delivery Statistics">
        <article className="metric-card">
          <div className="metric-card__icon-wrapper metric-card__icon-wrapper--green">
            <Package className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="metric-card__content">
            <span className="metric-card__label">Active deliveries</span>
            <span className="metric-card__value">{metrics.activeDeliveries ?? 0}</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-card__icon-wrapper metric-card__icon-wrapper--green">
            <Truck className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="metric-card__content">
            <span className="metric-card__label">Delivered this month</span>
            <span className="metric-card__value">{metrics.deliveredThisMonth ?? 0}</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-card__icon-wrapper metric-card__icon-wrapper--orange">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="metric-card__content">
            <span className="metric-card__label">Needs attention</span>
            <span className="metric-card__value">{metrics.needsAttention ?? 0}</span>
          </div>
        </article>
      </section>

      {/* Track a parcel Section */}
      <section className="track-parcel-card" aria-label="Track a parcel">
        <h2 className="track-parcel-card__title">Track a parcel</h2>
        <form onSubmit={handleTrackSubmit} className="track-parcel-form">
          <div className="track-parcel-input-wrapper">
            <Search className="track-parcel-icon" />
            <input
              type="text"
              value={trackingInput}
              onChange={(e) => {
                setTrackingInput(e.target.value)
                setSearchFeedback(null)
              }}
              placeholder="Enter tracking number"
              className="track-parcel-input"
            />
          </div>
          <button type="submit" className="track-parcel-submit-btn">
            Track
          </button>
        </form>
        {searchFeedback && (
          <div className="track-parcel-feedback" role="alert">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>{searchFeedback}</span>
          </div>
        )}
      </section>

      {/* Main 2-Column Section */}
      <div className="customer-dashboard__main-grid">
        {/* Left Column: Active deliveries */}
        <section className="customer-dashboard__left-col" aria-label="Active deliveries list">
          <div className="section-header">
            <h2 className="section-header__title">Active deliveries</h2>
            <Link to="/customer/deliveries" className="section-header__link">
              View all
            </Link>
          </div>

          {/* Active Deliveries Dynamic List */}
          {activeDeliveriesList.length === 0 ? (
            <div className="empty-deliveries-card">
              <div className="empty-deliveries-icon">
                <Package className="w-8 h-8 text-emerald-800" />
              </div>
              <h3 className="empty-deliveries-title">No active deliveries</h3>
              <p className="empty-deliveries-subtitle">
                You haven't scheduled any deliveries yet. Click "Create delivery" to book your first courier pickup!
              </p>
              <button
                type="button"
                onClick={openCreateModal}
                className="empty-deliveries-btn"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                <span>Create delivery</span>
              </button>
            </div>
          ) : (
            activeDeliveriesList.map((delivery) => {
              const destinationCity =
                delivery.recipientAddress.split(',').pop()?.trim() || delivery.recipientAddress
              const isPending = delivery.status === 'PENDING'
              const isInTransit = delivery.status === 'IN_TRANSIT'
              const isOutForDelivery = delivery.status === 'OUT_FOR_DELIVERY'

              const stage1Completed = !isPending
              const stage2Completed = isInTransit || isOutForDelivery
              const stage3Active = isOutForDelivery

              const badgeText =
                delivery.status === 'OUT_FOR_DELIVERY'
                  ? 'Out for delivery'
                  : delivery.status === 'IN_TRANSIT'
                    ? 'In transit'
                    : delivery.status === 'PICKED_UP'
                      ? 'Picked up'
                      : 'Pending pickup'

              const badgeClass =
                delivery.status === 'OUT_FOR_DELIVERY'
                  ? 'badge--out-for-delivery'
                  : delivery.status === 'IN_TRANSIT' || delivery.status === 'PICKED_UP'
                    ? 'badge--in-transit'
                    : 'badge--pending'

              return (
                <article key={delivery.id} className="delivery-card">
                  <div className="delivery-card__header">
                    <div className="delivery-card__tracking-info">
                      <h3 className="delivery-card__tracking-number">{delivery.trackingNumber}</h3>
                      <span className="delivery-card__destination">To {destinationCity}</span>
                    </div>
                    <span className={`badge ${badgeClass}`}>{badgeText}</span>
                  </div>

                  {/* Stepper Timeline */}
                  <div className="delivery-stepper-container">
                    <div className="delivery-stepper-track">
                      {/* Stage 1: Picked up */}
                      <div
                        className={`stepper-node ${
                          stage1Completed
                            ? 'stepper-node--completed'
                            : isPending
                              ? 'stepper-node--active'
                              : 'stepper-node--pending'
                        }`}
                      >
                        <div className="stepper-dot-anchor">
                          <div
                            className={`stepper-dot ${
                              stage1Completed ? 'stepper-dot--completed' : 'stepper-dot--pending'
                            }`}
                          />
                          <div className="stepper-label-box stepper-label-box--first">
                            <span className="stepper-stage-title">Picked up</span>
                            <span className="stepper-stage-time">
                              {stage1Completed ? 'Confirmed' : 'Pending pickup'}
                            </span>
                          </div>
                        </div>
                        <div
                          className={`stepper-line ${
                            stage1Completed ? 'stepper-line--active' : 'stepper-line--pending'
                          }`}
                        />
                      </div>

                      {/* Stage 2: In transit */}
                      <div
                        className={`stepper-node ${
                          stage2Completed
                            ? 'stepper-node--completed'
                            : isInTransit
                              ? 'stepper-node--active'
                              : 'stepper-node--pending'
                        }`}
                      >
                        <div className="stepper-dot-anchor">
                          <div
                            className={`stepper-dot ${
                              stage2Completed ? 'stepper-dot--completed' : 'stepper-dot--pending'
                            }`}
                          />
                          <div className="stepper-label-box stepper-label-box--middle">
                            <span
                              className={`stepper-stage-title ${
                                !stage2Completed && !isInTransit ? 'stepper-stage-title--muted' : ''
                              }`}
                            >
                              In transit
                            </span>
                            {stage2Completed && (
                              <span className="stepper-stage-time">En route</span>
                            )}
                          </div>
                        </div>
                        <div
                          className={`stepper-line ${
                            stage2Completed ? 'stepper-line--active' : 'stepper-line--pending'
                          }`}
                        />
                      </div>

                      {/* Stage 3: Out for delivery */}
                      <div
                        className={`stepper-node ${
                          stage3Active ? 'stepper-node--active' : 'stepper-node--pending'
                        }`}
                      >
                        <div className="stepper-dot-anchor">
                          <div
                            className={`stepper-dot ${
                              stage3Active ? 'stepper-dot--completed' : 'stepper-dot--pending'
                            }`}
                          />
                          <div className="stepper-label-box stepper-label-box--middle">
                            <span
                              className={`stepper-stage-title ${
                                !stage3Active ? 'stepper-stage-title--muted' : ''
                              }`}
                            >
                              Out for delivery
                            </span>
                            {stage3Active && (
                              <span className="stepper-stage-time">With driver</span>
                            )}
                          </div>
                        </div>
                        <div className="stepper-line stepper-line--pending" />
                      </div>

                      {/* Stage 4: Delivered */}
                      <div className="stepper-node stepper-node--endpoint">
                        <div className="stepper-dot-anchor">
                          <div className="stepper-dot stepper-dot--pending" />
                          <div className="stepper-label-box stepper-label-box--last">
                            <span className="stepper-stage-title stepper-stage-title--muted">
                              Delivered
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Card Footer */}
                  <div className="delivery-card__footer">
                    <div className="delivery-card__meta">
                      <Package className="w-4 h-4 text-slate-400" />
                      <span>
                        {delivery.packageSize.charAt(0) + delivery.packageSize.slice(1).toLowerCase()}{' '}
                        parcel · {delivery.weightKg} kg · LKR {delivery.costLkr.toLocaleString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDelivery(delivery)}
                      className="delivery-card__details-btn"
                    >
                      <span>View details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </section>

        {/* Right Column: Attention & Assistant Cards */}
        <aside className="customer-dashboard__right-col" aria-label="Support & Notices">
          {/* Card 1: Delivery needs attention */}
          {attentionDelivery ? (
            <article className="attention-card">
              <div className="attention-card__header">
                <AlertTriangle className="attention-card__icon" />
                <h2 className="attention-card__title">Delivery needs attention</h2>
              </div>

              <div className="attention-card__inner">
                <div className="attention-card__inner-header">
                  <h3 className="attention-card__tracking">{attentionDelivery.trackingNumber}</h3>
                  <span className="attention-card__dest">
                    To{' '}
                    {attentionDelivery.recipientAddress.split(',').pop()?.trim() ||
                      attentionDelivery.recipientAddress}
                  </span>
                </div>

                <h4 className="attention-card__issue-title">Delivery failed / delayed</h4>
                <p className="attention-card__issue-desc">
                  Our driver could not reach the recipient. Please verify contact information.
                </p>

                <button
                  type="button"
                  onClick={() => setSelectedDelivery(attentionDelivery)}
                  className="attention-card__link-btn"
                >
                  <span>View delivery</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </article>
          ) : (
            <article className="attention-card attention-card--safe">
              <div className="attention-card__header">
                <CheckCircle className="attention-card__icon text-emerald-600" />
                <h2 className="attention-card__title">All deliveries on track</h2>
              </div>

              <div className="attention-card__inner">
                <p className="attention-card__issue-desc">
                  No delivery exceptions, failed attempts, or delays requiring your attention.
                </p>
              </div>
            </article>
          )}

          {/* Card 2: Need a hand? */}
          <article className="assistant-card">
            <div className="assistant-card__header">
              <MessageSquare className="assistant-card__icon" />
              <h2 className="assistant-card__title">Need a hand?</h2>
            </div>

            <p className="assistant-card__subtitle">Ask about a parcel or delivery fee.</p>

            <button
              type="button"
              onClick={() => setIsAssistantOpen(true)}
              className="assistant-card__cta-btn"
            >
              <Bot className="w-4 h-4" />
              <span>Ask delivery assistant</span>
            </button>
          </article>
        </aside>
      </div>

      {/* -------------------------------------------------------------
       * Modal 1: Delivery Details Dialog
       * ------------------------------------------------------------- */}
      {selectedDelivery && (
        <div className="modal-backdrop" onClick={() => setSelectedDelivery(null)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-details-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="delivery-details-title" className="modal-title">
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
                  <span
                    className={`badge ${
                      selectedDelivery.status === 'IN_TRANSIT'
                        ? 'badge--in-transit'
                        : selectedDelivery.status === 'OUT_FOR_DELIVERY'
                        ? 'badge--out-for-delivery'
                        : selectedDelivery.status === 'FAILED'
                        ? 'badge--failed'
                        : 'badge--default'
                    }`}
                  >
                    {selectedDelivery.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="modal-info-item">
                  <span className="modal-info-label">Package Size & Weight</span>
                  <span className="modal-info-value">
                    {selectedDelivery.packageSize} · {selectedDelivery.weightKg} kg
                  </span>
                </div>

                <div className="modal-info-item">
                  <span className="modal-info-label">Recipient</span>
                  <span className="modal-info-value">{selectedDelivery.recipientName}</span>
                </div>

                <div className="modal-info-item">
                  <span className="modal-info-label">Phone</span>
                  <span className="modal-info-value">{selectedDelivery.recipientPhone}</span>
                </div>

                <div className="modal-info-item modal-info-item--full">
                  <span className="modal-info-label">Destination Address</span>
                  <span className="modal-info-value flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {selectedDelivery.recipientAddress}
                  </span>
                </div>
              </div>

              {selectedDelivery.status === 'FAILED' && (
                <div className="modal-alert-box">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <div>
                    <strong>Action Required:</strong> The recipient could not be contacted at the
                    delivery destination. Courier will retry during regular business hours tomorrow.
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setSelectedDelivery(null)}
                className="modal-btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * Modal 2: Delivery Assistant Dialog
       * ------------------------------------------------------------- */}
      {isAssistantOpen && (
        <div className="modal-backdrop" onClick={() => setIsAssistantOpen(false)}>
          <div
            className="modal-card modal-card--assistant"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-modal-title"
          >
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <div className="assistant-avatar">
                  <Bot className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 id="assistant-modal-title" className="modal-title">
                    Delivery Assistant
                  </h3>
                  <p className="modal-subtitle">Ask questions about rates, parcels, or timings</p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsAssistantOpen(false)}
                aria-label="Close assistant dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="assistant-chat-body">
              {assistantMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`assistant-msg ${
                    msg.sender === 'user' ? 'assistant-msg--user' : 'assistant-msg--bot'
                  }`}
                >
                  <p>{msg.text}</p>
                </div>
              ))}
            </div>

            <div className="assistant-quick-prompts">
              <button
                type="button"
                onClick={() => handleAssistantSend('How much is island-wide delivery fee?')}
                className="assistant-chip"
              >
                Delivery fees?
              </button>
              <button
                type="button"
                onClick={() => handleAssistantSend('What should I do if recipient is unavailable?')}
                className="assistant-chip"
              >
                Recipient unavailable?
              </button>
              <button
                type="button"
                onClick={() => handleAssistantSend('How long does Kandy or Galle delivery take?')}
                className="assistant-chip"
              >
                Delivery timings?
              </button>
            </div>

            <div className="assistant-chat-input-row">
              <input
                type="text"
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAssistantSend()
                  }
                }}
                placeholder="Type your question..."
                className="assistant-input"
              />
              <button
                type="button"
                onClick={() => handleAssistantSend()}
                className="assistant-send-btn"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CustomerDashboard
