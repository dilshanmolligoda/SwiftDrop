import React from 'react'
import { NotConnectedNotice } from '../components/NotConnectedNotice'
import styles from './MerchantPages.module.css'

const examplePayload = `POST https://your-store.example/webhooks/swiftdrop
X-SwiftDrop-Event-Id: 6f1c2c8e-…
X-SwiftDrop-Timestamp: 1793830000
X-SwiftDrop-Signature: sha256=<HMAC-SHA256 of "timestamp.body">

{
  "eventId": "6f1c2c8e-…",
  "trackingNumber": "SD-7K2M9QX4",
  "merchantOrderRef": "ORDER-1001",
  "status": "OUT_FOR_DELIVERY",
  "occurredAt": "2026-11-07T08:30:00Z"
}`

export const MerchantWebhooksPage: React.FC = () => (
  <div className={styles.page}>
    <div className={styles.intro}>
      <h2>Webhooks</h2>
      <p>SwiftDrop calls your store whenever one of your parcels changes status.</p>
    </div>

    <NotConnectedNotice>
      Registering an endpoint and viewing delivery attempts will be enabled once the webhook
      service is connected.
    </NotConnectedNotice>

    <section className={styles.card}>
      <h3>Endpoint</h3>
      <p className={styles.muted}>No webhook endpoint registered.</p>
      <div className={styles.actionRow}>
        <button type="button" className={styles.button} disabled>
          Register endpoint
        </button>
      </div>
    </section>

    <section className={styles.card}>
      <h3>What you receive</h3>
      <pre className={styles.code}>{examplePayload}</pre>
    </section>

    <section className={styles.card}>
      <h3>Delivery rules</h3>
      <ul className={styles.list}>
        <li>Verify the signature with your signing secret and reject requests older than 5 minutes.</li>
        <li>Reply with any <strong>2xx</strong> status to confirm receipt.</li>
        <li>Timeouts, <strong>429</strong> and <strong>5xx</strong> responses are retried after 30s, 2m, 8m, 32m and about 2h.</li>
        <li>Other <strong>4xx</strong> responses are not retried.</li>
        <li>The same event may arrive more than once. Use <code className={styles.inlineCode}>eventId</code> to ignore repeats.</li>
      </ul>
    </section>
  </div>
)
