import { env } from '../lib/env'

/**
 * Typed HTTP client for the SwiftDrop API.
 *
 * Authentication uses the HTTP-only session cookie set by `/auth/login`, so every
 * request is sent with credentials and no token is ever read or stored in JS.
 */

const NETWORK_ERROR_MESSAGE =
  'Unable to reach the SwiftDrop server. Check your connection and try again.'

export class ApiError extends Error {
  readonly status: number
  readonly messages: readonly string[]

  constructor(status: number, messages: readonly string[]) {
    super(messages[0] ?? `Request failed (HTTP ${status})`)
    this.name = 'ApiError'
    this.status = status
    this.messages = messages
  }
}

type QueryValue = string | number | boolean | null | undefined

export interface ApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly query?: Readonly<Record<string, QueryValue>>
  readonly body?: unknown
  readonly signal?: AbortSignal
}

export interface ApiUploadOptions {
  readonly onProgress?: (percent: number) => void
  readonly signal?: AbortSignal
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Normalises anything thrown by a request into an ApiError. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  return new ApiError(0, [NETWORK_ERROR_MESSAGE])
}

function buildUrl(path: string, query?: ApiRequestOptions['query']): string {
  const url = `${env.apiBaseUrl}${path}`
  if (!query) return url

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const search = params.toString()
  return search ? `${url}?${search}` : url
}

function parseJson(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** Extracts NestJS-style error messages (`message: string | string[]`). */
function extractMessages(body: unknown, status: number): string[] {
  if (body && typeof body === 'object' && 'message' in body) {
    const { message } = body as { message?: unknown }
    if (Array.isArray(message)) {
      const messages = message.filter((item): item is string => typeof item === 'string')
      if (messages.length > 0) return messages
    }
    if (typeof message === 'string' && message.trim()) return [message]
  }
  return [`Request failed (HTTP ${status})`]
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, signal } = options
  const hasBody = body !== undefined

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiError(0, [NETWORK_ERROR_MESSAGE])
  }

  const text = await response.text()
  const parsed = parseJson(text)

  if (!response.ok) {
    throw new ApiError(response.status, extractMessages(parsed, response.status))
  }
  return parsed as T
}

/**
 * Multipart upload with progress reporting. `fetch` cannot report upload
 * progress, so this uses XMLHttpRequest with credentials enabled.
 */
export function apiUpload<T>(
  path: string,
  formData: FormData,
  options: ApiUploadOptions = {},
): Promise<T> {
  const { onProgress, signal } = options

  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'))
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', buildUrl(path))
    xhr.withCredentials = true

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    }

    xhr.onload = () => {
      const parsed = parseJson(xhr.responseText)
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed as T)
      } else {
        reject(new ApiError(xhr.status, extractMessages(parsed, xhr.status)))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, [NETWORK_ERROR_MESSAGE]))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))

    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(formData)
  })
}
