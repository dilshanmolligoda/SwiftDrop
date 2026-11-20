import { env } from '../../../lib/env'

/** An API error with a message that is safe to show to the merchant. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Could not reach SwiftDrop. Check your connection and try again.')
  }

  if (response.status === 401) {
    // Session expired: back to the shared login page.
    window.location.assign('/login')
    throw new ApiError(401, 'Your session has expired. Please sign in again.')
  }
  if (response.status === 204) return undefined as T

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (data as { message?: unknown } | null)?.message
    throw new ApiError(
      response.status,
      Array.isArray(message) ? String(message[0]) : typeof message === 'string' ? message : `Request failed (HTTP ${response.status})`,
    )
  }
  return data as T
}

export interface ApiKeySummary {
  id: string
  name: string
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface CreatedApiKey extends ApiKeySummary {
  apiKey: string
}

export interface WebhookEndpoint {
  url: string
  createdAt: string
  updatedAt: string
}

export interface WebhookEndpointResult {
  endpoint: WebhookEndpoint
  signingSecret?: string
}

export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED'

export interface WebhookDeliveryAttempt {
  attemptNumber: number
  statusCode: number | null
  error: string | null
  durationMs: number
  attemptedAt: string
}

export interface WebhookDelivery {
  id: string
  eventId: string
  eventType: string
  status: DeliveryStatus
  attemptCount: number
  nextAttemptAt: string | null
  lastStatusCode: number | null
  lastError: string | null
  deliveredAt: string | null
  createdAt: string
  attempts: WebhookDeliveryAttempt[]
}

export const merchantApi = {

  listApiKeys: () => request<ApiKeySummary[]>('GET', '/merchants/me/api-keys'),
  createApiKey: (name: string) => request<CreatedApiKey>('POST', '/merchants/me/api-keys', { name }),
  revokeApiKey: (id: string) => request<ApiKeySummary>('DELETE', `/merchants/me/api-keys/${id}`),

  getWebhook: () => request<{ endpoint: WebhookEndpoint | null }>('GET', '/merchants/me/webhook'),
  saveWebhook: (url: string) => request<WebhookEndpointResult>('PUT', '/merchants/me/webhook', { url }),
  removeWebhook: () => request<void>('DELETE', '/merchants/me/webhook'),
  rotateWebhookSecret: () => request<WebhookEndpointResult>('POST', '/merchants/me/webhook/rotate-secret'),
  sendTestWebhook: () => request<WebhookDelivery>('POST', '/merchants/me/webhook/test'),
  listWebhookDeliveries: () => request<WebhookDelivery[]>('GET', '/merchants/me/webhook/deliveries'),
  redeliverWebhook: (id: string) =>
    request<WebhookDelivery>('POST', `/merchants/me/webhook/deliveries/${id}/redeliver`),
}
