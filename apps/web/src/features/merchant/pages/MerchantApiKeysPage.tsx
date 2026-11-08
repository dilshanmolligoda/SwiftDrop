import React from 'react'
import { env } from '../../../lib/env'
import { NotConnectedNotice } from '../components/NotConnectedNotice'
import styles from './MerchantPages.module.css'

const exampleRequest = `curl -X POST ${env.apiBaseUrl}/merchant-api/orders \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: sd_your_key_here" \\
  -H "Idempotency-Key: 2f0c1a7e-order-1001" \\
  -d '{ "merchantOrderRef": "ORDER-1001", ... }'`

export const MerchantApiKeysPage: React.FC = () => (
  <div className={styles.page}>
    <div className={styles.intro}>
      <h2>API keys</h2>
      <p>Your store's system uses an API key to create delivery orders automatically.</p>
    </div>

    <NotConnectedNotice>
      Creating and revoking keys will be enabled once the API key service is connected.
    </NotConnectedNotice>

    <section className={styles.card}>
      <h3>Your keys</h3>
      <p className={styles.muted}>You have no API keys yet.</p>
      <div className={styles.actionRow}>
        <button type="button" className={styles.button} disabled>
          Create API key
        </button>
      </div>
    </section>

    <section className={styles.card}>
      <h3>How keys work</h3>
      <ul className={styles.list}>
        <li>A new key is shown <strong>only once</strong>. Copy it into your store's settings straight away.</li>
        <li>SwiftDrop stores only a hash of the key, so it cannot be shown again. Lost a key? Revoke it and create a new one.</li>
        <li>Send it in the <code className={styles.inlineCode}>X-API-Key</code> header, never in the URL.</li>
        <li>Add an <code className={styles.inlineCode}>Idempotency-Key</code> header so a retried request never creates a duplicate order.</li>
      </ul>
    </section>

    <section className={styles.card}>
      <h3>Example request</h3>
      <pre className={styles.code}>{exampleRequest}</pre>
    </section>
  </div>
)
