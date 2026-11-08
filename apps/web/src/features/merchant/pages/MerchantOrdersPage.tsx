import React from 'react'
import { NotConnectedNotice } from '../components/NotConnectedNotice'
import styles from './MerchantPages.module.css'

const COLUMNS = ['Tracking no.', 'Order ref', 'Recipient', 'Status', 'Fee', 'Created'] as const

export const MerchantOrdersPage: React.FC = () => (
  <div className={styles.page}>
    <div className={styles.intro}>
      <h2>Orders</h2>
      <p>Every delivery your store has booked with SwiftDrop and its current status.</p>
    </div>

    <NotConnectedNotice>
      The orders list will load from SwiftDrop once the parcels service is connected.
    </NotConnectedNotice>

    <section className={styles.card}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column} scope="col">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className={styles.emptyRow}>
              <td colSpan={COLUMNS.length}>No orders yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
)
