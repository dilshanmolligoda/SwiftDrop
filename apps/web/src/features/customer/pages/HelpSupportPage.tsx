import React, { useState, useRef, useEffect } from 'react'
import {
  Package,
  Truck,
  AlertTriangle,
  MessageSquare,
  Phone,
  Send,
  RefreshCw,
  Calculator,
  X,
  MapPin,
  Mail,
} from 'lucide-react'
import { useCustomerDeliveries } from '../context/useCustomerDeliveries'
import { useCustomerProfile } from '../context/useCustomerProfile'
import './HelpSupportPage.css'

interface ChatMessage {
  readonly id: string
  readonly sender: 'user' | 'assistant'
  readonly text: string
  readonly timestamp: string
  readonly category?: 'tracking' | 'rates' | 'issue' | 'general'
}

export const HelpSupportPage: React.FC = () => {
  const { metrics, deliveries } = useCustomerDeliveries()
  const { profile } = useCustomerProfile()

  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom()
    }
  }, [messages, isTyping])

  const handleSendPrompt = (promptText: string, category: 'tracking' | 'rates' | 'issue'): void => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    setIsTyping(true)

    setTimeout(() => {
      let replyText = ''
      if (category === 'tracking') {
        const activeList = deliveries.filter((d) => d.status !== 'DELIVERED')
        if (activeList.length > 0) {
          const listSummary = activeList
            .map(
              (d) =>
                `• ${d.trackingNumber} (${d.status.replace(/_/g, ' ')}) to ${d.recipientAddress} - ${d.packageSize} (${d.weightKg} kg)`,
            )
            .join('\n')
          replyText = `Here are your current active parcels:\n\n${listSummary}\n\nYou can track step-by-step milestones or view live status updates directly on your dashboard.`
        } else {
          replyText =
            'You currently have 2 active parcels on the way:\n\n• SD-24819: In transit to Kandy (ETA today)\n• SD-24820: Out for delivery to Galle (Driver nearby)\n• SD-24817: Needs attention in Matara (Recipient unavailable)'
        }
      } else if (category === 'rates') {
        replyText =
          'SwiftDrop Island-wide Delivery Rates:\n\n' +
          '• Colombo 1–15 (Local): LKR 350 for parcels under 1 kg (+LKR 80/extra kg)\n' +
          '• Western Province Suburbs: LKR 450 for parcels under 1 kg (+LKR 90/extra kg)\n' +
          '• Island-wide Express (Kandy, Galle, Matara, etc.): LKR 650 up to 1 kg (+LKR 100/extra kg)\n\n' +
          'All deliveries include real-time GPS tracking and SMS alerts.'
      } else if (category === 'issue') {
        replyText =
          'Regarding your active delivery issue for parcel SD-24817 (To Matara):\n\n' +
          '• Issue: Recipient unavailable at destination address.\n' +
          '• Action: Our local dispatch courier will automatically attempt a 2nd delivery run tomorrow during business hours.\n' +
          '• Need immediate re-route? You can update recipient contact details or call our priority dispatch desk at 011-234-5678.'
      }

      const botMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        category,
      }

      setMessages((prev) => [...prev, botMsg])
      setIsTyping(false)
    }, 550)
  }

  const handleCustomSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed) return

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    setInputText('')
    setIsTyping(true)

    setTimeout(() => {
      const lower = trimmed.toLowerCase()
      let reply =
        "Thank you for reaching out! I've noted your question. If you need urgent assistance with live parcel dispatch, you can also connect directly with our support team using the 'Contact support' button."

      if (lower.includes('track') || lower.includes('parcel') || lower.includes('where is') || lower.includes('status')) {
        reply =
          "To track any parcel, simply enter your tracking number (like SD-24819 or SD-24820) in the dashboard search bar. Both active shipments are currently in transit on schedule."
      } else if (lower.includes('price') || lower.includes('cost') || lower.includes('fee') || lower.includes('rate')) {
        reply =
          "Delivery fees start at LKR 350 for local Colombo drop-offs, and LKR 650 for island-wide express delivery with island-wide coverage. Rates are calculated based on weight and destination zone."
      } else if (lower.includes('phone') || lower.includes('contact') || lower.includes('agent') || lower.includes('human') || lower.includes('call')) {
        reply =
          "You can speak with a customer care representative by calling 011-234-5678 (Mon–Sat 8:00 AM – 8:00 PM) or emailing support@swiftdrop.lk."
      } else if (lower.includes('matara') || lower.includes('unavailable') || lower.includes('failed') || lower.includes('delay')) {
        reply =
          "For delivery SD-24817 (Matara), our courier was unable to contact the recipient. A second delivery attempt is scheduled for tomorrow. We have also notified the sender."
      }

      const botMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prev) => [...prev, botMsg])
      setIsTyping(false)
    }, 600)
  }

  return (
    <div className="help-support-page">
      {/* Page Header */}
      <header className="help-support-header">
        <h1 className="help-support-header__title">Help & support</h1>
        <p className="help-support-header__subtitle">Get help with your deliveries.</p>
      </header>

      {/* Row of 3 Metric Cards */}
      <section className="help-support-metrics" aria-label="Delivery Summary">
        <article className="support-metric-card">
          <div className="support-metric-card__icon-wrapper support-metric-card__icon-wrapper--green">
            <Package className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="support-metric-card__content">
            <span className="support-metric-card__label">Active deliveries</span>
            <span className="support-metric-card__value">{metrics.activeDeliveries || 3}</span>
          </div>
        </article>

        <article className="support-metric-card">
          <div className="support-metric-card__icon-wrapper support-metric-card__icon-wrapper--green">
            <Truck className="w-5 h-5 text-emerald-800" />
          </div>
          <div className="support-metric-card__content">
            <span className="support-metric-card__label">Delivered this month</span>
            <span className="support-metric-card__value">{metrics.deliveredThisMonth || 12}</span>
          </div>
        </article>

        <article className="support-metric-card">
          <div className="support-metric-card__icon-wrapper support-metric-card__icon-wrapper--orange">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="support-metric-card__content">
            <span className="support-metric-card__label">Needs attention</span>
            <span className="support-metric-card__value">{metrics.needsAttention || 1}</span>
          </div>
        </article>
      </section>

      {/* Main Assistant Card */}
      <section className="assistant-main-card" aria-label="SwiftDrop AI Support Assistant">
        {/* Card Header */}
        <div className="assistant-main-card__header">
          <div className="assistant-main-card__identity">
            <div className="assistant-main-card__icon-wrap">
              <MessageSquare className="w-4 h-4 text-emerald-700" />
            </div>
            <h2 className="assistant-main-card__title">SwiftDrop Assistant</h2>
            <span className="assistant-main-card__badge">AI</span>
          </div>

          <button
            type="button"
            onClick={() => setIsContactModalOpen(true)}
            className="assistant-main-card__contact-btn"
          >
            <Phone className="w-3.5 h-3.5 mr-1.5" />
            <span>Contact support</span>
          </button>
        </div>

        {/* Assistant Content Area */}
        <div className="assistant-main-card__body">
          {messages.length === 0 ? (
            /* Welcome / Zero State View matching mockup */
            <div className="assistant-zero-state">
              <div className="assistant-zero-state__icon-bubble">
                <MessageSquare className="w-7 h-7 text-emerald-700" />
              </div>
              <h3 className="assistant-zero-state__title">How can I help you?</h3>
              <p className="assistant-zero-state__subtitle">
                Ask about tracking, delivery charges, or delivery issues.
              </p>

              {/* 3 Quick Action Chips */}
              <div className="assistant-zero-state__chips">
                <button
                  type="button"
                  onClick={() => handleSendPrompt('Track my parcel', 'tracking')}
                  className="assistant-action-chip"
                >
                  <Package className="w-4 h-4 text-slate-500 mr-2" />
                  <span>Track my parcel</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendPrompt('Estimate delivery cost', 'rates')}
                  className="assistant-action-chip"
                >
                  <Calculator className="w-4 h-4 text-slate-500 mr-2" />
                  <span>Estimate delivery cost</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendPrompt('I have a delivery issue', 'issue')}
                  className="assistant-action-chip"
                >
                  <RefreshCw className="w-4 h-4 text-slate-500 mr-2" />
                  <span>Delivery issue</span>
                </button>
              </div>
            </div>
          ) : (
            /* Live Chat Message Flow */
            <div className="assistant-chat-flow">
              <div className="assistant-chat-flow__intro">
                <div className="assistant-chat-flow__avatar">
                  <MessageSquare className="w-4 h-4 text-emerald-700" />
                </div>
                <div>
                  <span className="assistant-chat-flow__name">SwiftDrop AI Assistant</span>
                  <p className="assistant-chat-flow__desc">
                    Ready to answer delivery, rate, and tracking inquiries.
                  </p>
                </div>
              </div>

              {messages.map((item) => (
                <div
                  key={item.id}
                  className={`chat-bubble ${
                    item.sender === 'user' ? 'chat-bubble--user' : 'chat-bubble--assistant'
                  }`}
                >
                  <div className="chat-bubble__content">
                    <p className="chat-bubble__text">{item.text}</p>
                    <span className="chat-bubble__time">{item.timestamp}</span>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="chat-bubble chat-bubble--assistant">
                  <div className="chat-typing-indicator">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Quick Follow-up Row if messages are present */}
        {messages.length > 0 && (
          <div className="assistant-active-chips">
            <button
              type="button"
              onClick={() => handleSendPrompt('Track my parcel', 'tracking')}
              className="assistant-mini-chip"
            >
              <Package className="w-3.5 h-3.5 mr-1 text-slate-500" />
              Track parcel
            </button>
            <button
              type="button"
              onClick={() => handleSendPrompt('Estimate delivery cost', 'rates')}
              className="assistant-mini-chip"
            >
              <Calculator className="w-3.5 h-3.5 mr-1 text-slate-500" />
              Delivery costs
            </button>
            <button
              type="button"
              onClick={() => handleSendPrompt('I have a delivery issue', 'issue')}
              className="assistant-mini-chip"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1 text-slate-500" />
              Delivery issues
            </button>
          </div>
        )}

        {/* Card Footer: Input & Disclaimer */}
        <div className="assistant-main-card__footer">
          <form onSubmit={handleCustomSubmit} className="assistant-input-form">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your question..."
              className="assistant-main-input"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="assistant-submit-btn"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <p className="assistant-disclaimer">
            AI responses may be inaccurate. Verify important details.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------------
       * Contact Support Modal
       * ------------------------------------------------------------- */}
      {isContactModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsContactModalOpen(false)}>
          <div
            className="modal-card modal-card--contact"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-support-title"
          >
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <div className="contact-avatar">
                  <Phone className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 id="contact-support-title" className="modal-title">
                    Contact SwiftDrop Support
                  </h3>
                  <p className="modal-subtitle">Our team is here to assist you</p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsContactModalOpen(false)}
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              <div className="contact-cards-grid">
                <a href="tel:+94112345678" className="contact-channel-card">
                  <div className="contact-channel-icon-wrap">
                    <Phone className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h4 className="contact-channel-name">Hotline Dispatch</h4>
                    <p className="contact-channel-detail">011-234-5678</p>
                    <span className="contact-channel-time">Mon – Sat, 8:00 AM – 8:00 PM</span>
                  </div>
                </a>

                <a href="mailto:support@swiftdrop.lk" className="contact-channel-card">
                  <div className="contact-channel-icon-wrap">
                    <Mail className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h4 className="contact-channel-name">Email Support</h4>
                    <p className="contact-channel-detail">support@swiftdrop.lk</p>
                    <span className="contact-channel-time">24-hour response turnaround</span>
                  </div>
                </a>

                <div className="contact-channel-card contact-channel-card--static">
                  <div className="contact-channel-icon-wrap">
                    <MapPin className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h4 className="contact-channel-name">Central Distribution Hub</h4>
                    <p className="contact-channel-detail">No. 45, Galle Road, Colombo 03</p>
                    <span className="contact-channel-time">Walk-in inquiries & parcel drops</span>
                  </div>
                </div>
              </div>

              <div className="contact-user-meta">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Logged in as: <strong>{profile.fullName || 'Customer'}</strong></span>
                  <span>Email: <strong>{profile.email}</strong></span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setIsContactModalOpen(false)}
                className="modal-btn-secondary"
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

export default HelpSupportPage
