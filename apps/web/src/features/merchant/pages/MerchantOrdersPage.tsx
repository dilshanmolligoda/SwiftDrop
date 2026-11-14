import React, { useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronDown, Download, ImageOff, Package, Search, TriangleAlert, X } from 'lucide-react'
import styles from './MerchantOrdersPage.module.css'

type OrderStatus = 'Created' | 'Out for Delivery' | 'In Transit' | 'Picked Up' | 'Failed' | 'Delivered'

interface MerchantOrder {
  readonly trackingNo: string
  readonly orderRef: string
  readonly recipient: string
  readonly address: string
  readonly sizeWeight: string
  readonly fee: string
  readonly status: OrderStatus
  readonly created: string
  readonly source: string
}

const orders: readonly MerchantOrder[] = [
  { trackingNo: 'SD-24821', orderRef: 'GL-1048', recipient: 'Nimal Perera', address: '18 Temple Rd, Kandy', sizeWeight: 'M · 2.5 kg', fee: 'LKR 600', status: 'Created', created: '26 Oct 2026', source: 'API' },
  { trackingNo: 'SD-24820', orderRef: 'GL-1047', recipient: 'Amali Silva', address: '42 Main St, Galle', sizeWeight: 'S · 1 kg', fee: 'LKR 450', status: 'Out for Delivery', created: '25 Oct 2026', source: 'API' },
  { trackingNo: 'SD-24819', orderRef: 'GL-1046', recipient: 'Kavindu Jay', address: '12 Park Rd, Colombo', sizeWeight: 'M · 3 kg', fee: 'LKR 650', status: 'In Transit', created: '25 Oct 2026', source: 'Portal' },
  { trackingNo: 'SD-24818', orderRef: 'GL-1045', recipient: 'Tharushi Silva', address: '8 Lake Rd, Negombo', sizeWeight: 'L · 5 kg', fee: 'LKR 850', status: 'Picked Up', created: '25 Oct 2026', source: 'API' },
  { trackingNo: 'SD-24817', orderRef: 'GL-1044', recipient: 'Dinesh Fernando', address: '21 Beach Rd, Matara', sizeWeight: 'S · 1.5 kg', fee: 'LKR 500', status: 'Failed', created: '24 Oct 2026', source: 'API' },
  { trackingNo: 'SD-24816', orderRef: 'GL-1043', recipient: 'Ishara Perera', address: '9 Hill St, Kandy', sizeWeight: 'M · 2 kg', fee: 'LKR 550', status: 'Delivered', created: '24 Oct 2026', source: 'Portal' },
]

const statusClass: Record<OrderStatus, string> = {
  Created: styles.created,
  'Out for Delivery': styles.outForDelivery,
  'In Transit': styles.inTransit,
  'Picked Up': styles.pickedUp,
  Failed: styles.failed,
  Delivered: styles.delivered,
}

const timelineSteps = ['Created', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'] as const

export const MerchantOrdersPage: React.FC = () => {
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('All statuses')
  const [selectedOrder, setSelectedOrder] = useState<MerchantOrder | null>(null)
  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    return orders.filter((order) => {
      const matchesQuery = !query || [order.trackingNo, order.orderRef, order.recipient].some((value) => value.toLowerCase().includes(query))
      return matchesQuery && (selectedStatus === 'All statuses' || order.status === selectedStatus)
    })
  }, [search, selectedStatus])

  return (
    <div className={styles.page}>
      <header><h1>Orders</h1><p>View and track all your business deliveries.</p></header>
      <section className={styles.metrics} aria-label="Order summary">
        <div className={styles.metricCard}><div className={`${styles.metricIcon} ${styles.green}`}><Package size={21} /></div><div><span>ACTIVE DELIVERIES</span><strong>24</strong><small>All active orders</small></div></div>
        <div className={styles.metricCard}><div className={`${styles.metricIcon} ${styles.mint}`}><Package size={21} /></div><div><span>DELIVERED THIS MONTH</span><strong>128</strong><small>October 2026</small></div></div>
        <div className={styles.metricCard}><div className={`${styles.metricIcon} ${styles.yellow}`}><TriangleAlert size={20} /></div><div><span>NEEDS ATTENTION</span><strong>3</strong><small>Failed delivery attempts</small></div></div>
      </section>
      <section className={styles.ordersCard}>
        <div className={styles.cardHeader}><h2>All orders</h2><button type="button" className={styles.export}><Download size={14} /> Export CSV</button></div>
        <div className={styles.filters}>
          <label className={styles.search}><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tracking number, order or recipient" aria-label="Search orders" /></label>
          <label className={styles.select}><select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}><option>All statuses</option>{(['Created', 'Out for Delivery', 'In Transit', 'Picked Up', 'Failed', 'Delivered'] as const).map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label>
          <button type="button" className={styles.date}><CalendarDays size={13} /> 01 Oct – 26 Oct 2026</button>
        </div>
        <div className={styles.tableWrapper}>
          <table><thead><tr><th>TRACKING<br />NO.</th><th>ORDER<br />REF</th><th>RECIPIENT</th><th>DROP-OFF<br />ADDRESS</th><th>SIZE /<br />WEIGHT</th><th>FEE</th><th>STATUS</th><th>CREATED</th><th>SOURCE</th></tr></thead>
            <tbody>{filteredOrders.map((order) => <tr key={order.trackingNo} className={styles.orderRow} onClick={() => setSelectedOrder(order)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedOrder(order) }} tabIndex={0}><td className={styles.strong}>{order.trackingNo}</td><td>{order.orderRef}</td><td className={styles.recipient}>{order.recipient}</td><td>{order.address}</td><td>{order.sizeWeight}</td><td className={styles.strong}>{order.fee}</td><td><span className={`${styles.status} ${statusClass[order.status]}`}>{order.status}</span></td><td>{order.created}</td><td>{order.source}</td></tr>)}</tbody>
          </table>
        </div>
        <footer className={styles.pagination}><span>Showing <strong>{filteredOrders.length ? '1–6' : '0'}</strong> of <strong>155</strong> orders</span><div><span>Rows per page</span><button type="button">6 <ChevronDown size={12} /></button><button type="button">Previous</button><button type="button" className={styles.current}>1</button><button type="button">2</button><button type="button">3</button><span>...</span><button type="button">26</button><button type="button">Next</button></div></footer>
      </section>
      {selectedOrder && <div className={styles.drawerLayer} role="presentation"><button type="button" className={styles.drawerBackdrop} onClick={() => setSelectedOrder(null)} aria-label="Close order details" /><aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="order-details-title">
        <div className={styles.drawerHeader}><h2 id="order-details-title">Order details</h2><button type="button" onClick={() => setSelectedOrder(null)} aria-label="Close order details"><X size={18} /></button></div>
        <div className={styles.drawerContent}><span className={styles.detailLabel}>Tracking number</span><div className={styles.trackingHeader}><strong>{selectedOrder.trackingNo}</strong><span className={`${styles.status} ${statusClass[selectedOrder.status]}`}>{selectedOrder.status}</span></div><p className={styles.detailMeta}>Order ref {selectedOrder.orderRef} &nbsp;·&nbsp; Source {selectedOrder.source}</p>
          <div className={styles.detailGrid}><div><span className={styles.detailLabel}>Recipient</span><strong>{selectedOrder.recipient}</strong></div><div><span className={styles.detailLabel}>Drop-off address</span><strong>{selectedOrder.address}</strong></div><div><span className={styles.detailLabel}>Parcel</span><strong>{selectedOrder.sizeWeight}</strong></div><div><span className={styles.detailLabel}>Fee</span><strong>{selectedOrder.fee}</strong></div></div>
          <section className={styles.timelineSection}><div className={styles.sectionHeading}><h3>Delivery timeline</h3><span>All times Sri Lanka time</span></div><ol className={styles.timeline}>{[...timelineSteps.slice(0, -1), ...(selectedOrder.status === 'Failed' ? ['Failed'] : ['Delivered'])].map((step, index) => {
            const targetIndex = selectedOrder.status === 'Failed' ? timelineSteps.length - 1 : timelineSteps.indexOf(selectedOrder.status as (typeof timelineSteps)[number])
            const isFailed = step === 'Failed'
            const isPending = index > targetIndex
            const isCompleted = !isPending && !isFailed
            const hasNextStep = index < timelineSteps.length - 1
            const connectorClass = hasNextStep ? selectedOrder.status === 'Failed' && step === 'Out for Delivery' ? styles.timelineConnectorFailed : index < targetIndex ? styles.timelineConnectorComplete : styles.timelineConnectorPending : ''
            return <li key={`${step}-${index}`} className={`${isFailed ? styles.timelineFailed : ''} ${isPending ? styles.timelinePending : ''} ${connectorClass}`}><span className={styles.timelineIcon}>{isFailed ? <X size={11} /> : isCompleted ? <Check size={11} /> : null}</span><div><strong>{step}</strong>{!isPending && <span>{selectedOrder.created}, {index === 0 ? '09:10' : `${10 + index}:40`}</span>}</div></li>
          })}</ol></section>
          {selectedOrder.status === 'Failed' && <div className={styles.failureReason}><strong>Failure reason</strong><span>Recipient unavailable at the delivery address.</span></div>}
          <section className={styles.proofSection}><h3>Proof of delivery</h3><div className={styles.proofPlaceholder}><ImageOff size={18} /><span>Not available — delivery was unsuccessful.</span></div></section>
        </div>
      </aside></div>}
    </div>
  )
}

export default MerchantOrdersPage
