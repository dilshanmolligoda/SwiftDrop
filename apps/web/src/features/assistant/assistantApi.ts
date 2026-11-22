import { env } from '../../lib/env'

/**
 * Client for the SwiftDrop AI assistant (apps/ai-assistant).
 * The HttpOnly session cookie (path /api) is sent automatically with
 * `credentials: 'include'`, so no token is ever read in JavaScript.
 */

export type AssistantRole = 'CUSTOMER' | 'MERCHANT'

export interface AssistantMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

/** Must match the limits in apps/ai-assistant/src/app.ts */
export const MAX_MESSAGE_LENGTH = 1000
const MAX_HISTORY = 10

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  401: 'Your session has expired. Please log in again to use the assistant.',
  403: 'This request was blocked. Please refresh the page and try again.',
  429: 'You are sending messages too quickly. Please wait a few minutes.',
  503: 'The assistant is not available right now. Please try again later.',
}
const GENERIC_ERROR = 'Sorry, the assistant is having trouble right now. Please try again.'
const NETWORK_ERROR = 'Unable to reach the assistant. Check your connection and try again.'

export class AssistantError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AssistantError'
    this.status = status
  }
}

/**
 * The chat shows plain text only (never HTML). Models sometimes still answer
 * in Markdown, so strip the common symbols to keep replies readable.
 */
export function toPlainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/__(.+?)__/g, '$1') // __bold__
    .replace(/`([^`]+)`/g, '$1') // `code`
    .replace(/^#{1,6}\s+/gm, '') // # headings
    .replace(/^\s*[*-]\s+/gm, '• ') // * item / - item
    .trim()
}

/** Sends the recent conversation and returns the assistant's reply. */
export async function sendAssistantMessage(
  messages: readonly AssistantMessage[],
  signal?: AbortSignal,
): Promise<string> {
  // Keep the payload within the server's limits
  const history = messages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role,
    content: m.content.slice(0, MAX_MESSAGE_LENGTH),
  }))

  let response: Response
  try {
    response = await fetch(`${env.aiAssistantUrl}/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AssistantError(0, NETWORK_ERROR)
  }

  const data = (await response.json().catch(() => null)) as { reply?: unknown } | null
  const reply = typeof data?.reply === 'string' ? data.reply : ''

  if (response.ok && reply) return toPlainText(reply)
  throw new AssistantError(response.status, STATUS_MESSAGES[response.status] ?? GENERIC_ERROR)
}
