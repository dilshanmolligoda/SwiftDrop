import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Send } from 'lucide-react'
import {
  merchantApi,
  type DeliveryStatus,
  type WebhookDelivery,
  type WebhookEndpoint,
} from '../api/merchant.api'
import { ConfirmDialog, SecretDialog } from '../components/Dialog'
import { formatDateTime, formatRelative } from '../utils/format'
import styles from './MerchantPages.module.css'

const REFRESH_WHILE_PENDING_MS = 4000

const STATUS_BADGE: Record<DeliveryStatus, { label: string; className: string }> = {
  DELIVERED: { label: 'Delivered', className: styles.statusOk },
  PENDING: { label: 'Retrying', className: styles.statusWarn },
  FAILED: { label: 'Failed', className: styles.statusBad },
}

type PendingAction = 'rotate' | 'remove' | null

export const MerchantWebhooksPage: React.FC = () => {
  const [endpoint, setEndpoint] = useState<WebhookEndpoint | null | undefined>(undefined)
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<PendingAction>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [, setTick] = useState(0)

  const loadDeliveries = useCallback(async () => {
    setDeliveries(await merchantApi.listWebhookDeliveries())
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([merchantApi.getWebhook(), merchantApi.listWebhookDeliveries()])
      .then(([{ endpoint: current }, list]) => {
        if (!active) return
        setEndpoint(current)
        setUrl(current?.url ?? '')
        setDeliveries(list)
      })
      .catch((err: Error) => active && setLoadError(err.message))
    return () => {
      active = false
    }
  }, [])

  // Keep the log live while a delivery is waiting for its next retry.
  const hasPending = deliveries.some((d) => d.status === 'PENDING')
  useEffect(() => {
    if (!hasPending) return
    const timer = setInterval(() => {
      setTick((n) => n + 1)
      void loadDeliveries().catch(() => undefined)
    }, REFRESH_WHILE_PENDING_MS)
    return () => clearInterval(timer)
  }, [hasPending, loadDeliveries])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const result = await merchantApi.saveWebhook(url.trim())
      setEndpoint(result.endpoint)
      setUrl(result.endpoint.url)
      setEditing(false)
      if (result.signingSecret) setSecret(result.signingSecret)
      else setNotice('Webhook URL updated.')
    })
  }

  const sendTest = () =>
    void run(async () => {
      const delivery = await merchantApi.sendTestWebhook()
      await loadDeliveries()
      setExpanded(delivery.id)
      setNotice(
        delivery.status === 'DELIVERED'
          ? `Test event delivered. Your server answered HTTP ${delivery.lastStatusCode}.`
          : delivery.status === 'PENDING'
            ? `Your server did not accept the test event (${describeResult(delivery)}). SwiftDrop will retry automatically.`
            : `Your server rejected the test event (${describeResult(delivery)}). It will not be retried.`,
      )
    })

  const redeliver = (id: string) =>
    void run(async () => {
      const delivery = await merchantApi.redeliverWebhook(id)
      await loadDeliveries()
      setExpanded(delivery.id)
    })

  const confirmAction = () =>
    void run(async () => {
      if (confirm === 'rotate') {
        const result = await merchantApi.rotateWebhookSecret()
        setSecret(result.signingSecret ?? null)
      } else if (confirm === 'remove') {
        await merchantApi.removeWebhook()
        setEndpoint(null)
        setUrl('')
        setDeliveries([])
        setNotice('Webhook endpoint removed. SwiftDrop will stop sending events.')
      }
      setConfirm(null)
    })

  const showForm = endpoint === null || editing

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h3>Webhooks</h3>
        <p>SwiftDrop calls your store's server whenever something happens to one of your parcels.</p>
      </div>

      {loadError && <div className={styles.alertError} role="alert">{loadError}</div>}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3>Endpoint</h3>
            <p>The URL on your server that receives SwiftDrop events.</p>
          </div>
          {endpoint && !editing && <span className={styles.statusOk}>Active</span>}
        </div>

        {endpoint === undefined && !loadError && <p className={styles.muted}>Loading…</p>}

        {showForm && endpoint !== undefined && (
          <form className={styles.form} onSubmit={save}>
            <label className={styles.field}>
              Webhook URL
              <input
                className={styles.input}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-store.example/webhooks/swiftdrop"
                required
              />
            </label>
            <button type="submit" className={styles.button} disabled={busy || !url.trim()}>
              {endpoint ? 'Save URL' : 'Register endpoint'}
            </button>
            {editing && (
              <button type="button" className={styles.secondaryButton} onClick={() => { setEditing(false); setUrl(endpoint?.url ?? '') }}>
                Cancel
              </button>
            )}
          </form>
        )}

        {endpoint && !editing && (
          <>
            <code className={styles.endpointUrl}>{endpoint.url}</code>
            <p className={styles.hint}>Registered {formatDateTime(endpoint.createdAt)}</p>
            <div className={styles.actionRow} style={{ marginTop: 14 }}>
              <button type="button" className={styles.button} onClick={sendTest} disabled={busy}>
                <Send size={16} aria-hidden="true" />
                {busy ? 'Sending…' : 'Send test event'}
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => setEditing(true)} disabled={busy}>
                Change URL
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => setConfirm('rotate')} disabled={busy}>
                Rotate signing secret
              </button>
              <button type="button" className={styles.dangerLink} onClick={() => setConfirm('remove')} disabled={busy}>
                Remove
              </button>
            </div>
          </>
        )}

        {error && <div className={styles.alertError} role="alert" style={{ marginTop: 12 }}>{error}</div>}
      </section>

      {notice && <div className={styles.alertSuccess} role="status">{notice}</div>}

      {endpoint && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3>Recent deliveries</h3>
              <p>Every event SwiftDrop sent to your endpoint, with each attempt.</p>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={() => void loadDeliveries()}>
              <RefreshCw size={15} aria-hidden="true" />
              Refresh
            </button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Status</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Last response</th>
                  <th scope="col">Sent</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {deliveries.length === 0 ? (
                  <tr className={styles.emptyRow}>
                    <td colSpan={6}>No deliveries yet. Use "Send test event" to try your endpoint.</td>
                  </tr>
                ) : (
                  deliveries.map((delivery) => (
                    <DeliveryRow
                      key={delivery.id}
                      delivery={delivery}
                      expanded={expanded === delivery.id}
                      onToggle={() => setExpanded(expanded === delivery.id ? null : delivery.id)}
                      onRedeliver={() => redeliver(delivery.id)}
                      busy={busy}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={styles.card}>
        <h3>Verifying webhooks on your server</h3>
        <pre className={styles.code}>{`POST <your webhook URL>
X-SwiftDrop-Event-Id: <unique id, use it to ignore repeats>
X-SwiftDrop-Timestamp: <unix seconds>
X-SwiftDrop-Signature: sha256=<HMAC-SHA256 of "timestamp.body" with your signing secret>`}</pre>
        <ul className={styles.list}>
          <li>Recompute the signature with your signing secret and reject anything that does not match, or is older than 5 minutes.</li>
          <li>Reply with any <strong>2xx</strong> status to confirm receipt.</li>
          <li>Timeouts, <strong>408</strong>, <strong>429</strong> and <strong>5xx</strong> replies are retried after 30s, 2m, 8m, 32m and about 2h. Other <strong>4xx</strong> replies are not retried.</li>
        </ul>
      </section>

      <SecretDialog
        open={secret !== null}
        title="Your webhook signing secret"
        label="Signing secret"
        secret={secret ?? ''}
        description="Your server uses it to check that each webhook really came from SwiftDrop."
        onDone={() => setSecret(null)}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'rotate' ? 'Rotate the signing secret?' : 'Remove the webhook endpoint?'}
        message={
          confirm === 'rotate'
            ? 'A new secret is created and the current one stops working immediately. Update your server with the new secret straight away.'
            : 'SwiftDrop will stop sending events to your server, and the delivery history is deleted.'
        }
        confirmLabel={confirm === 'rotate' ? 'Rotate secret' : 'Remove endpoint'}
        busy={busy}
        onConfirm={confirmAction}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

function describeResult(delivery: Pick<WebhookDelivery, 'lastStatusCode' | 'lastError'>): string {
  return delivery.lastStatusCode ? `HTTP ${delivery.lastStatusCode}` : delivery.lastError ?? 'no response'
}

interface DeliveryRowProps {
  readonly delivery: WebhookDelivery
  readonly expanded: boolean
  readonly busy: boolean
  readonly onToggle: () => void
  readonly onRedeliver: () => void
}

const DeliveryRow: React.FC<DeliveryRowProps> = ({ delivery, expanded, busy, onToggle, onRedeliver }) => {
  const badge = STATUS_BADGE[delivery.status]
  return (
    <>
      <tr>
        <td>
          <span className={styles.mono}>{delivery.eventType}</span>
          <span className={styles.subtle}>{delivery.eventId.slice(0, 8)}…</span>
        </td>
        <td>
          <span className={badge.className}>{badge.label}</span>
          {delivery.status === 'PENDING' && delivery.nextAttemptAt && (
            <span className={styles.subtle}>next {formatRelative(delivery.nextAttemptAt)}</span>
          )}
        </td>
        <td>
          {/* Total attempts across rounds; attemptCount restarts when a failed delivery is sent again. */}
          <button type="button" className={styles.expandButton} onClick={onToggle} aria-expanded={expanded}>
            {delivery.attempts.length} {expanded ? '▲' : '▼'}
          </button>
        </td>
        <td>{describeResult(delivery)}</td>
        <td>{formatDateTime(delivery.createdAt)}</td>
        <td className={styles.cellActions}>
          {delivery.status === 'FAILED' && (
            <button type="button" className={styles.secondaryButton} onClick={onRedeliver} disabled={busy}>
              Send again
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6}>
            {delivery.attempts.length === 0 ? (
              <span className={styles.muted}>Waiting for the first attempt…</span>
            ) : (
              <ol className={styles.attemptList}>
                {delivery.attempts.map((attempt) => (
                  <li key={`${attempt.attemptedAt}-${attempt.attemptNumber}`}>
                    {formatDateTime(attempt.attemptedAt)}: {describeResult({ lastStatusCode: attempt.statusCode, lastError: attempt.error })} in {attempt.durationMs} ms
                  </li>
                ))}
              </ol>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
