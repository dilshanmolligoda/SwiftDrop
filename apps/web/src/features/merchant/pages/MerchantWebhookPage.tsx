import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Copy, KeyRound, PlugZap, RefreshCw, Unplug } from 'lucide-react'
import { apiRequest, ApiError } from '../../../api/client'
import { LiveIndicator } from '../../../lib/realtime/LiveIndicator'
import { useLiveParcelEvents } from '../../../lib/realtime/useParcelRealtime'
import styles from './MerchantWebhookPage.module.css'

interface WebhookSettings {
  readonly configured: boolean
  readonly url: string | null
  readonly isActive: boolean
  readonly secretHint: string | null
  readonly updatedAt: string | null
  /** Only right after create / rotate — never shown again. */
  readonly signingSecret?: string
}

type DeliveryStatus = 'DELIVERED' | 'RETRY_SCHEDULED' | 'FAILED' | 'DEAD_LETTERED'

interface Delivery {
  readonly id: string
  readonly eventType: string
  readonly trackingNumber: string
  readonly attempt: number
  readonly status: DeliveryStatus
  readonly responseStatus: number | null
  readonly durationMs: number | null
  readonly errorMessage: string | null
  readonly nextAttemptAt: string | null
  readonly createdAt: string
}

interface DeliveryPage {
  readonly items: readonly Delivery[]
  readonly page: number
  readonly pageSize: number
  readonly total: number
}

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  DELIVERED: 'Delivered',
  RETRY_SCHEDULED: 'Retrying',
  FAILED: 'Failed',
  DEAD_LETTERED: 'Gave up',
}

const PAGE_SIZE = 20

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString()
}

/**
 * Store connections: the merchant's webhook URL, signing secret and the log of
 * every delivery attempt. API: /merchant/webhook (apps/api merchant-webhooks).
 */
export default function MerchantWebhookPage() {
  const [settings, setSettings] = useState<WebhookSettings | null>(null)
  const [url, setUrl] = useState('')
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const [deliveries, setDeliveries] = useState<DeliveryPage | null>(null)
  const [status, setStatus] = useState<DeliveryStatus | ''>('')
  const [page, setPage] = useState(1)
  const [reloadCount, setReloadCount] = useState(0)
  const reloadDeliveries = useCallback(() => setReloadCount((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<WebhookSettings>('/merchant/webhook', { signal: controller.signal })
      .then((loaded) => {
        setSettings(loaded)
        setUrl(loaded.url ?? '')
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setMessage({ kind: 'error', text: errorText(error) })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<DeliveryPage>('/merchant/webhook/deliveries', {
      query: { page, pageSize: PAGE_SIZE, status: status || undefined },
      signal: controller.signal,
    })
      .then(setDeliveries)
      .catch(() => undefined) // the table keeps its last result
    return () => controller.abort()
  }, [page, status, reloadCount])

  // A parcel of ours changed → the worker sends a webhook; show it once logged.
  const { state: liveState } = useLiveParcelEvents(reloadDeliveries, {
    enabled: Boolean(settings?.configured),
    debounceMs: 2_000,
  })

  const run = async (action: () => Promise<WebhookSettings>, success: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await action()
      setSettings(result)
      setUrl(result.url ?? '')
      if (result.signingSecret) {
        setNewSecret(result.signingSecret)
        setCopied(false)
      }
      setMessage({ kind: 'ok', text: success })
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) })
    } finally {
      setBusy(false)
    }
  }

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(
      () => apiRequest<WebhookSettings>('/merchant/webhook', { method: 'PUT', body: { url } }),
      settings?.configured ? 'Webhook URL saved.' : 'Webhook created. Copy your signing secret now.',
    )
  }

  const rotate = () => {
    if (!window.confirm('Create a new signing secret? The current one stops working immediately.')) return
    void run(
      () => apiRequest<WebhookSettings>('/merchant/webhook/rotate-secret', { method: 'POST' }),
      'New signing secret created. Update it in your store now.',
    )
  }

  const disable = () => {
    if (!window.confirm('Stop sending webhooks to your store? You can turn them on again by saving the URL.')) return
    void run(() => apiRequest<WebhookSettings>('/merchant/webhook', { method: 'DELETE' }), 'Webhooks turned off.')
  }

  const copySecret = async () => {
    if (!newSecret) return
    try {
      await navigator.clipboard.writeText(newSecret)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const totalPages = deliveries ? Math.max(1, Math.ceil(deliveries.total / deliveries.pageSize)) : 1

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>Store connections</h1>
          <p>SwiftDrop sends a signed webhook to your store every time one of your parcels changes status.</p>
        </div>
        {settings?.configured && <LiveIndicator state={liveState} />}
      </header>

      {message && (
        <p className={message.kind === 'error' ? styles.error : styles.success} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      <section className={styles.card} aria-labelledby="webhook-settings-title">
        <div className={styles.cardHeading}>
          <h2 id="webhook-settings-title"><PlugZap aria-hidden="true" size={18} /> Webhook</h2>
          {settings?.configured && (
            <span className={settings.isActive ? styles.badgeOn : styles.badgeOff}>
              {settings.isActive ? 'Active' : 'Off'}
            </span>
          )}
        </div>

        <form className={styles.form} onSubmit={save}>
          <label htmlFor="webhook-url">Webhook URL</label>
          <div className={styles.row}>
            <input
              id="webhook-url"
              type="url"
              required
              maxLength={2048}
              placeholder="https://your-store.example/webhooks/swiftdrop"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy || !settings}
            />
            <button type="submit" className={styles.primary} disabled={busy || !settings}>
              {settings?.configured ? 'Save' : 'Create webhook'}
            </button>
          </div>
          <p className={styles.hint}>Must be a public https address. Your store should answer with HTTP 2xx within 5 seconds.</p>
        </form>

        {newSecret && (
          <div className={styles.secret} role="alert">
            <p><strong>Your signing secret</strong> — copy it now, it will not be shown again.</p>
            <div className={styles.row}>
              <code>{newSecret}</code>
              <button type="button" className={styles.secondary} onClick={() => void copySecret()}>
                <Copy aria-hidden="true" size={16} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className={styles.hint}>
              Verify each webhook: <code>X-SwiftDrop-Signature</code> = <code>sha256=</code> HMAC-SHA256 of{' '}
              <code>{'<X-SwiftDrop-Timestamp>.<raw body>'}</code> with this secret.
            </p>
          </div>
        )}

        {settings?.configured && (
          <div className={styles.actions}>
            <span className={styles.hint}>Signing secret: <code>{settings.secretHint}</code></span>
            <button type="button" className={styles.secondary} onClick={rotate} disabled={busy}>
              <KeyRound aria-hidden="true" size={16} /> New secret
            </button>
            {settings.isActive && (
              <button type="button" className={styles.danger} onClick={disable} disabled={busy}>
                <Unplug aria-hidden="true" size={16} /> Turn off
              </button>
            )}
          </div>
        )}
      </section>

      <section className={styles.card} aria-labelledby="webhook-log-title">
        <div className={styles.cardHeading}>
          <h2 id="webhook-log-title">Delivery log</h2>
          <div className={styles.row}>
            <select
              aria-label="Filter by result"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as DeliveryStatus | '')
                setPage(1)
              }}
            >
              <option value="">All results</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button type="button" className={styles.secondary} onClick={reloadDeliveries}>
              <RefreshCw aria-hidden="true" size={16} /> Refresh
            </button>
          </div>
        </div>

        {!deliveries ? (
          <p className={styles.hint}>Loading…</p>
        ) : deliveries.items.length === 0 ? (
          <p className={styles.hint}>No webhook deliveries yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Tracking number</th>
                  <th scope="col">Attempt</th>
                  <th scope="col">Result</th>
                  <th scope="col">Response</th>
                  <th scope="col">Next try</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.items.map((d) => (
                  <tr key={d.id}>
                    <td>{formatTime(d.createdAt)}</td>
                    <td><code>{d.trackingNumber}</code></td>
                    <td>{d.attempt}</td>
                    <td><span className={styles[`status_${d.status}`]}>{STATUS_LABELS[d.status]}</span></td>
                    <td>
                      {d.responseStatus ?? '—'}
                      {d.durationMs !== null && <span className={styles.hint}> · {d.durationMs} ms</span>}
                      {d.errorMessage && <div className={styles.hint}>{d.errorMessage}</div>}
                    </td>
                    <td>{d.nextAttemptAt ? formatTime(d.nextAttemptAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {deliveries && deliveries.total > PAGE_SIZE && (
          <div className={styles.pager}>
            <button type="button" className={styles.secondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className={styles.hint}>Page {page} of {totalPages}</span>
            <button type="button" className={styles.secondary} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </section>
    </div>
  )
}
