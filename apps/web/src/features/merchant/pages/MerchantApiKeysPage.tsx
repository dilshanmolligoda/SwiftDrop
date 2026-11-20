import React, { useCallback, useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { env } from '../../../lib/env'
import { merchantApi, type ApiKeySummary, type CreatedApiKey } from '../api/merchant.api'
import { ConfirmDialog, SecretDialog } from '../components/Dialog'
import { formatDateTime } from '../utils/format'
import styles from './MerchantPages.module.css'

const MAX_ACTIVE_KEYS = 5

export const MerchantApiKeysPage: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [toRevoke, setToRevoke] = useState<ApiKeySummary | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setKeys(await merchantApi.listApiKeys())
      setLoadError(null)
    } catch (error) {
      setLoadError((error as Error).message)
    }
  }, [])

  useEffect(() => {
    let active = true
    merchantApi
      .listApiKeys()
      .then((list) => active && setKeys(list))
      .catch((error: Error) => active && setLoadError(error.message))
    return () => {
      active = false
    }
  }, [])

  const activeCount = keys?.filter((k) => !k.revokedAt).length ?? 0
  const atLimit = activeCount >= MAX_ACTIVE_KEYS

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    setCreating(true)
    setFormError(null)
    setNotice(null)
    try {
      const key = await merchantApi.createApiKey(name.trim())
      setCreated(key)
      setName('')
      await load()
    } catch (error) {
      setFormError((error as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const revoke = async () => {
    if (!toRevoke) return
    setRevoking(true)
    try {
      await merchantApi.revokeApiKey(toRevoke.id)
      setNotice(`"${toRevoke.name}" was revoked. Requests using it are now rejected.`)
      setToRevoke(null)
      await load()
    } catch (error) {
      setNotice(null)
      setFormError((error as Error).message)
      setToRevoke(null)
    } finally {
      setRevoking(false)
    }
  }

  const examplePrefix = keys?.find((k) => !k.revokedAt)?.keyPrefix ?? 'sd_xxxxxxxx'

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h3>API keys</h3>
        <p>Your store's system uses an API key to talk to SwiftDrop, for example to create delivery orders.</p>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3>Create a key</h3>
            <p>Name it after where it will be used, so you can recognise it later.</p>
          </div>
          <span className={styles.statusMuted}>{activeCount} of {MAX_ACTIVE_KEYS} active</span>
        </div>
        <form className={styles.form} onSubmit={(e) => void create(e)}>
          <label className={styles.field}>
            Key name
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Online store"
              maxLength={60}
              required
              disabled={atLimit}
            />
          </label>
          <button type="submit" className={styles.button} disabled={creating || atLimit || !name.trim()}>
            <KeyRound size={16} aria-hidden="true" />
            {creating ? 'Creating…' : 'Create API key'}
          </button>
        </form>
        {atLimit && <p className={styles.hint}>You have the maximum number of active keys. Revoke one to create another.</p>}
        {formError && <div className={styles.alertError} role="alert" style={{ marginTop: 12 }}>{formError}</div>}
      </section>

      {notice && <div className={styles.alertSuccess} role="status">{notice}</div>}

      <section className={styles.card}>
        <h3>Your keys</h3>
        {loadError ? (
          <div className={styles.alertError} role="alert">{loadError}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Key</th>
                  <th scope="col">Created</th>
                  <th scope="col">Last used</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {keys === null ? (
                  <tr className={styles.emptyRow}><td colSpan={6}>Loading keys…</td></tr>
                ) : keys.length === 0 ? (
                  <tr className={styles.emptyRow}><td colSpan={6}>No API keys yet. Create one above.</td></tr>
                ) : (
                  keys.map((key) => (
                    <tr key={key.id}>
                      <td>{key.name}</td>
                      <td className={styles.mono}>{key.keyPrefix}…</td>
                      <td>{formatDateTime(key.createdAt)}</td>
                      <td>{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : 'Never'}</td>
                      <td>
                        {key.revokedAt ? (
                          <span className={styles.statusMuted}>Revoked</span>
                        ) : (
                          <span className={styles.statusOk}>Active</span>
                        )}
                      </td>
                      <td className={styles.cellActions}>
                        {!key.revokedAt && (
                          <button type="button" className={styles.dangerLink} onClick={() => setToRevoke(key)}>
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h3>Check that your key works</h3>
        <p>Send it in the <code className={styles.inlineCode}>X-API-Key</code> header. SwiftDrop answers with your business details:</p>
        <pre className={styles.code}>{`curl ${env.apiBaseUrl}/merchant-api/me \\
  -H "X-API-Key: ${examplePrefix}…your full key…"`}</pre>
        <ul className={styles.list}>
          <li>SwiftDrop stores only a hash of each key, so a lost key cannot be shown again. Revoke it and create a new one.</li>
          <li>Never put the key in a URL or in code that runs in a customer's browser.</li>
          <li>Revoking a key takes effect immediately.</li>
        </ul>
      </section>

      <SecretDialog
        open={created !== null}
        title="Your new API key"
        label={created?.name ?? ''}
        secret={created?.apiKey ?? ''}
        description="Paste this key into your store's SwiftDrop settings."
        onDone={() => setCreated(null)}
      />

      <ConfirmDialog
        open={toRevoke !== null}
        title="Revoke this API key?"
        message={<>Any system still using <strong>{toRevoke?.name}</strong> ({toRevoke?.keyPrefix}…) will stop working immediately. This cannot be undone.</>}
        confirmLabel="Revoke key"
        busy={revoking}
        onConfirm={() => void revoke()}
        onCancel={() => setToRevoke(null)}
      />
    </div>
  )
}
