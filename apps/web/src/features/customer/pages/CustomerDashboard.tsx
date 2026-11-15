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
  const { metrics, deliveries, createDelivery } = useCustomerDeliveries()
  const [linkNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(
    getInitialLinkNotice,
  )

  // Tracking Search State
  const [trackingInput, setTrackingInput] = useState('')
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null)

  // Modal States
  const [selectedDelivery, setSelectedDelivery] = useState<CustomerDelivery | null>(null)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

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

  // New Delivery Form State
  const [newRecipientName, setNewRecipientName] = useState('')
  const [newRecipientAddress, setNewRecipientAddress] = useState('')
  const [newRecipientPhone, setNewRecipientPhone] = useState('')
  const [newPackageSize, setNewPackageSize] = useState<'SMALL' | 'MEDIUM' | 'LARGE'>('MEDIUM')
  const [newWeight, setNewWeight] = useState(1.5)

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

  const handleCreateDeliverySubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!newRecipientName || !newRecipientAddress) return

    createDelivery({
      senderName: 'Jane Doe',
      senderAddress: 'Colombo 03',
      recipientName: newRecipientName,
      recipientAddress: newRecipientAddress,
      recipientPhone: newRecipientPhone || '+94 77 000 0000',
      packageSize: newPackageSize,
      weightKg: newWeight,
      costLkr: newPackageSize === 'SMALL' ? 450 : newPackageSize === 'MEDIUM' ? 650 : 950,
    })

    setIsCreateModalOpen(false)
    setNewRecipientName('')
    setNewRecipientAddress('')
    setNewRecipientPhone('')
  }

  // Find deliveries to display matching Figma mockup
  const deliveryKandy = deliveries.find((d) => d.trackingNumber === 'SD-24819') || {
    id: 'del-24819',
    trackingNumber: 'SD-24819',
    senderName: 'Jane Doe',
    senderAddress: 'Colombo 03',
    recipientName: 'Sunil Perera',
    recipientAddress: 'Peradeniya Road, Kandy',
    recipientPhone: '+94 77 123 4567',
    packageSize: 'MEDIUM' as const,
    weightKg: 2.5,
    costLkr: 650,
    status: 'IN_TRANSIT' as const,
    createdAt: '2026-04-21T09:15:00.000Z',
  }

  const deliveryGalle = deliveries.find((d) => d.trackingNumber === 'SD-24820') || {
    id: 'del-24820',
    trackingNumber: 'SD-24820',
    senderName: 'Jane Doe',
    senderAddress: 'Colombo 03',
    recipientName: 'Nimal Silva',
    recipientAddress: 'Main Street, Galle',
    recipientPhone: '+94 71 987 6543',
    packageSize: 'SMALL' as const,
    weightKg: 1.2,
    costLkr: 450,
    status: 'OUT_FOR_DELIVERY' as const,
    createdAt: '2026-04-21T10:20:00.000Z',
  }

  const deliveryMatara = deliveries.find((d) => d.trackingNumber === 'SD-24817') || {
    id: 'del-24817',
    trackingNumber: 'SD-24817',
    senderName: 'Jane Doe',
    senderAddress: 'Colombo 03',
    recipientName: 'Kamal Fernando',
    recipientAddress: 'Beach Road, Matara',
    recipientPhone: '+94 76 555 1234',
    packageSize: 'MEDIUM' as const,
    weightKg: 3.0,
    costLkr: 750,
    status: 'FAILED' as const,
    createdAt: '2026-04-20T14:00:00.000Z',
  }

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
          onClick={() => setIsCreateModalOpen(true)}
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
            <span className="metric-card__value">{metrics.activeDeliveries || 3}</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-card__icon-wrapper metric-card__icon-wrapper--green">
            <Truck className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="metric-card__content">
            <span className="metric-card__label">Delivered this month</span>
            <span className="metric-card__value">{metrics.deliveredThisMonth || 12}</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-card__icon-wrapper metric-card__icon-wrapper--orange">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="metric-card__content">
            <span className="metric-card__label">Needs attention</span>
            <span className="metric-card__value">{metrics.needsAttention || 1}</span>
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

          {/* Delivery Card 1: SD-24819 (To Kandy - In transit) */}
          <article className="delivery-card">
            <div className="delivery-card__header">
              <div className="delivery-card__tracking-info">
                <h3 className="delivery-card__tracking-number">{deliveryKandy.trackingNumber}</h3>
                <span className="delivery-card__destination">To Kandy</span>
              </div>
              <span className="badge badge--in-transit">In transit</span>
            </div>

            {/* Stepper Timeline */}
            <div className="delivery-stepper-container">
              <div className="delivery-stepper-track">
                {/* Stage 1: Picked up */}
                <div className="stepper-node stepper-node--completed">
                  <div className="stepper-dot-anchor">
                    <div className="stepper-dot stepper-dot--completed" />
                    <div className="stepper-label-box stepper-label-box--first">
                      <span className="stepper-stage-title">Picked up</span>
                      <span className="stepper-stage-time">Apr 21, 09:15</span>
                    </div>
                  </div>
                  <div className="stepper-line stepper-line--active" />
                </div>

                {/* Stage 2: In transit */}
                <div className="stepper-node stepper-node--active">
                  <div className="stepper-dot-anchor">
                    <div className="stepper-dot stepper-dot--completed" />
                    <div className="stepper-label-box stepper-label-box--middle">
                      <span className="stepper-stage-title">In transit</span>
                      <span className="stepper-stage-time">Apr 22, 14:30</span>
                    </div>
                  </div>
                  <div className="stepper-line stepper-line--pending" />
                </div>

                {/* Stage 3: Out for delivery */}
                <div className="stepper-node stepper-node--pending">
                  <div className="stepper-dot-anchor">
                    <div className="stepper-dot stepper-dot--pending" />
                    <div className="stepper-label-box stepper-label-box--middle">
                      <span className="stepper-stage-title stepper-stage-title--muted">
                        Out for delivery
                      </span>
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
                <span>Medium parcel · 2.5 kg</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDelivery(deliveryKandy)}
                className="delivery-card__details-btn"
              >
                <span>View details</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </article>

          {/* Delivery Card 2: SD-24820 (To Galle - Out for delivery) */}
          <article className="delivery-card">
            <div className="delivery-card__header">
              <div className="delivery-card__tracking-info">
                <h3 className="delivery-card__tracking-number">{deliveryGalle.trackingNumber}</h3>
                <span className="delivery-card__destination">To Galle</span>
              </div>
              <span className="badge badge--out-for-delivery">Out for delivery</span>
            </div>

            {/* Stepper Timeline */}
            <div className="delivery-stepper-container">
              <div className="delivery-stepper-track">
                {/* Stage 1: Picked up */}
                <div className="stepper-node stepper-node--completed">
                  <div className="stepper-dot-anchor">
                    <div className="stepper-dot stepper-dot--completed" />
                    <div className="stepper-label-box stepper-label-box--first">
                      <span className="stepper-stage-title">Picked up</span>
                      <span className="stepper-stage-time">Apr 21, 10:20</span>
                    </div>
                  </div>
                  <div className="stepper-line stepper-line--active" />
                </div>

                {/* Stage 2: In transit */}
                <div className="stepper-node stepper-node--completed">
                  <div className="stepper-dot-anchor">
                    <div className="stepper-dot stepper-dot--completed" />
                    <div className="stepper-label-box stepper-label-box--middle">
                      <span className="stepper-stage-title">In transit</span>
                      <span className="stepper-stage-time">Apr 22, 08:10</span>
                    </div>
                  </div>
                  <div className="stepper-line stepper-line--active" />
                </div>

                {/* Stage 3: Out for delivery */}
                <div className="stepper-node stepper-node--active">
                  <div className="stepper-dot-anchor">
                    <div className="stepper-dot stepper-dot--completed" />
                    <div className="stepper-label-box stepper-label-box--middle">
                      <span className="stepper-stage-title">Out for delivery</span>
                      <span className="stepper-stage-time">Apr 22, 16:45</span>
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
                <span>Small parcel · 1.2 kg</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDelivery(deliveryGalle)}
                className="delivery-card__details-btn"
              >
                <span>View details</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </article>
        </section>

        {/* Right Column: Attention & Assistant Cards */}
        <aside className="customer-dashboard__right-col" aria-label="Support & Notices">
          {/* Card 1: Delivery needs attention */}
          <article className="attention-card">
            <div className="attention-card__header">
              <AlertTriangle className="attention-card__icon" />
              <h2 className="attention-card__title">Delivery needs attention</h2>
            </div>

            <div className="attention-card__inner">
              <div className="attention-card__inner-header">
                <h3 className="attention-card__tracking">{deliveryMatara.trackingNumber}</h3>
                <span className="attention-card__dest">To Matara</span>
              </div>

              <h4 className="attention-card__issue-title">Recipient unavailable</h4>
              <p className="attention-card__issue-desc">
                Our driver couldn't reach the recipient.
              </p>

              <button
                type="button"
                onClick={() => setSelectedDelivery(deliveryMatara)}
                className="attention-card__link-btn"
              >
                <span>View delivery</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </article>

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

      {/* -------------------------------------------------------------
       * Modal 3: Create Delivery Request Dialog
       * ------------------------------------------------------------- */}
      {isCreateModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-delivery-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="create-delivery-title" className="modal-title">
                  Create Delivery Request
                </h3>
                <p className="modal-subtitle">Schedule a pickup and book instant courier dispatch</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsCreateModalOpen(false)}
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDeliverySubmit} className="modal-form">
              <div className="modal-form-group">
                <label htmlFor="create-recipient-name" className="modal-label">
                  Recipient Name
                </label>
                <input
                  id="create-recipient-name"
                  type="text"
                  required
                  value={newRecipientName}
                  onChange={(e) => setNewRecipientName(e.target.value)}
                  placeholder="e.g. Sunil Perera"
                  className="modal-input"
                />
              </div>

              <div className="modal-form-group">
                <label htmlFor="create-recipient-address" className="modal-label">
                  Delivery Destination Address
                </label>
                <input
                  id="create-recipient-address"
                  type="text"
                  required
                  value={newRecipientAddress}
                  onChange={(e) => setNewRecipientAddress(e.target.value)}
                  placeholder="Street, City, Postal Code"
                  className="modal-input"
                />
              </div>

              <div className="modal-form-row">
                <div className="modal-form-group">
                  <label htmlFor="create-recipient-phone" className="modal-label">
                    Contact Phone
                  </label>
                  <input
                    id="create-recipient-phone"
                    type="tel"
                    value={newRecipientPhone}
                    onChange={(e) => setNewRecipientPhone(e.target.value)}
                    placeholder="+94 77 123 4567"
                    className="modal-input"
                  />
                </div>

              <div className="modal-form-row">
                <div className="modal-form-group">
                  <label htmlFor="create-package-size" className="modal-label">
                    Package Size
                  </label>
                  <select
                    id="create-package-size"
                    value={newPackageSize}
                    onChange={(e) =>
                      setNewPackageSize(e.target.value as 'SMALL' | 'MEDIUM' | 'LARGE')
                    }
                    className="modal-input"
                  >
                    <option value="SMALL">Small (under 1 kg)</option>
                    <option value="MEDIUM">Medium (1 - 5 kg)</option>
                    <option value="LARGE">Large (5+ kg)</option>
                  </select>
                </div>

                <div className="modal-form-group">
                  <label htmlFor="create-package-weight" className="modal-label">
                    Weight (kg)
                  </label>
                  <input
                    id="create-package-weight"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={newWeight}
                    onChange={(e) => setNewWeight(parseFloat(e.target.value) || 1.0)}
                    className="modal-input"
                  />
                </div>
              </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="modal-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="modal-btn-primary">
                  Book Delivery
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CustomerDashboard
