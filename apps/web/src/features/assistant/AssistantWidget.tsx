import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Bot, MessageCircle, RotateCcw, Send, X } from 'lucide-react'
import {
  AssistantError,
  MAX_MESSAGE_LENGTH,
  sendAssistantMessage,
  type AssistantMessage,
  type AssistantRole,
} from './assistantApi'
import './AssistantWidget.css'

interface AssistantWidgetProps {
  readonly role: AssistantRole
  /**
   * Identifies the logged-in user (e.g. email) so a conversation is never
   * shown to a different user who logs in on the same browser tab.
   */
  readonly userKey?: string
}

const GREETINGS: Readonly<Record<AssistantRole, string>> = {
  CUSTOMER:
    "Hi! I'm the SwiftDrop assistant. I can track your parcels, show your deliveries and estimate delivery prices.",
  MERCHANT:
    "Hi! I'm the SwiftDrop assistant. I can look up your orders, track parcels, summarise your dashboard and estimate delivery prices.",
}

const SUGGESTIONS: Readonly<Record<AssistantRole, readonly string[]>> = {
  CUSTOMER: ['Where is my parcel?', 'How much to send 2 kg to Kandy?', 'How many deliveries do I have?'],
  MERCHANT: ['How many orders are awaiting pickup?', 'Show my failed deliveries', 'How much to send 2 kg to Kandy?'],
}

/**
 * Conversations live in memory (not localStorage) so they survive page
 * navigation inside the portal but disappear on reload or a new tab.
 */
const conversationStore = new Map<string, AssistantMessage[]>()

export const AssistantWidget: React.FC<AssistantWidgetProps> = ({ role, userKey = '' }) => {
  const storeKey = `${role}:${userKey}`
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>(() => conversationStore.get(storeKey) ?? [])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const panelId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Keep the conversation across page changes for the same user
  useEffect(() => {
    conversationStore.set(storeKey, messages)
  }, [storeKey, messages])

  // Cancel an in-flight request if the widget unmounts
  useEffect(() => () => abortRef.current?.abort(), [])

  // Scroll to the newest message
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, isSending, error, isOpen])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  const close = useCallback(() => {
    setIsOpen(false)
    launcherRef.current?.focus()
  }, [])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim().slice(0, MAX_MESSAGE_LENGTH)
      if (!content || isSending) return

      const next: AssistantMessage[] = [...messages, { role: 'user', content }]
      setMessages(next)
      setInput('')
      setError(null)
      setIsSending(true)

      const controller = new AbortController()
      abortRef.current = controller
      try {
        const reply = await sendAssistantMessage(next, controller.signal)
        setMessages((current) => [...current, { role: 'assistant', content: reply }])
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof AssistantError ? err.message : 'Something went wrong. Please try again.')
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (!controller.signal.aborted) setIsSending(false)
      }
    },
    [messages, isSending],
  )

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    void send(input)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter adds a new line
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send(input)
    }
  }

  const handlePanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') close()
  }

  const resetConversation = () => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
    setIsSending(false)
    inputRef.current?.focus()
  }

  return (
    <div className="sd-assistant">
      {isOpen && (
        <section
          id={panelId}
          className="sd-assistant__panel"
          role="dialog"
          aria-label="SwiftDrop assistant chat"
          onKeyDown={handlePanelKeyDown}
        >
          <header className="sd-assistant__header">
            <div className="sd-assistant__title">
              <span className="sd-assistant__avatar" aria-hidden="true">
                <Bot size={18} />
              </span>
              <div>
                <strong>SwiftDrop Assistant</strong>
                <span className="sd-assistant__subtitle">AI · answers may be inaccurate</span>
              </div>
            </div>
            <div className="sd-assistant__header-actions">
              <button
                type="button"
                className="sd-assistant__icon-btn"
                onClick={resetConversation}
                aria-label="Start a new conversation"
                title="New conversation"
                disabled={messages.length === 0 && !error}
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                className="sd-assistant__icon-btn"
                onClick={close}
                aria-label="Close assistant"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="sd-assistant__messages" ref={listRef} aria-live="polite">
            <div className="sd-assistant__bubble sd-assistant__bubble--assistant">{GREETINGS[role]}</div>

            {messages.length === 0 && (
              <div className="sd-assistant__suggestions">
                {SUGGESTIONS[role].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="sd-assistant__chip"
                    onClick={() => void send(suggestion)}
                    disabled={isSending}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message, index) => (
              // Rendered as plain text (never HTML): LLM output is untrusted
              <div
                key={index}
                className={`sd-assistant__bubble sd-assistant__bubble--${message.role}`}
              >
                {message.content}
              </div>
            ))}

            {isSending && (
              <div className="sd-assistant__bubble sd-assistant__bubble--assistant sd-assistant__typing" role="status">
                <span className="sd-assistant__sr-only">Assistant is typing</span>
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <span aria-hidden="true" />
              </div>
            )}

            {error && (
              <div className="sd-assistant__error" role="alert">
                {error}
              </div>
            )}
          </div>

          <form className="sd-assistant__composer" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              className="sd-assistant__input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about a parcel, order or price…"
              aria-label="Message the assistant"
              maxLength={MAX_MESSAGE_LENGTH}
              rows={1}
              disabled={isSending}
            />
            <button
              type="submit"
              className="sd-assistant__send"
              disabled={isSending || input.trim().length === 0}
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </form>
        </section>
      )}

      <button
        ref={launcherRef}
        type="button"
        className={`sd-assistant__launcher ${isOpen ? 'sd-assistant__launcher--open' : ''}`}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={isOpen ? 'Close assistant' : 'Open SwiftDrop assistant'}
      >
        {isOpen ? <X size={22} /> : <MessageCircle size={24} />}
      </button>
    </div>
  )
}

export default AssistantWidget
