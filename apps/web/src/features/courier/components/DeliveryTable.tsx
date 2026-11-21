import { Link } from 'react-router-dom'
import { ChevronRight, Clock3, MapPin, Phone } from 'lucide-react'
import type { DeliveryListItem } from '../types/courier.types'
import { formatTime } from '../utils/format'
import { StatusBadge } from './StatusBadge'

interface DeliveryTableProps {
  readonly items: readonly DeliveryListItem[]
  readonly caption: string
}

const detailsPath = (item: DeliveryListItem) => `/courier/deliveries/${item.id}`

/** Table on wide screens, stacked cards on phones. */
export function DeliveryTable({ items, caption }: DeliveryTableProps) {
  return (
    <>
      <div className="cp-table-wrap">
        <table className="cp-table">
          <caption className="cp-sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Tracking number</th>
              <th scope="col">Recipient</th>
              <th scope="col">Delivery address</th>
              <th scope="col">Contact</th>
              <th scope="col">Assigned</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="cp-sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.assignmentId}>
                <td>
                  <Link to={detailsPath(item)} className="cp-table__tracking">
                    {item.trackingNumber}
                  </Link>
                </td>
                <td className="cp-table__strong">{item.recipientName}</td>
                <td className="cp-table__address" title={item.recipientAddress}>
                  {item.recipientAddress}
                </td>
                <td>
                  <a href={`tel:${item.recipientPhone}`} className="cp-table__phone">
                    {item.recipientPhone}
                  </a>
                </td>
                <td className="cp-table__muted">
                  <time dateTime={item.assignedAt}>{formatTime(item.assignedAt)}</time>
                </td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
                <td className="cp-table__action">
                  <Link
                    to={detailsPath(item)}
                    className="cp-btn cp-btn--soft cp-btn--sm"
                    aria-label={`View details for ${item.trackingNumber}`}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="cp-delivery-cards" aria-label={caption}>
        {items.map((item) => (
          <li key={item.assignmentId}>
            <Link to={detailsPath(item)} className="cp-delivery-card">
              <span className="cp-delivery-card__top">
                <span className="cp-delivery-card__tracking">{item.trackingNumber}</span>
                <StatusBadge status={item.status} />
              </span>
              <span className="cp-delivery-card__name">{item.recipientName}</span>
              <span className="cp-delivery-card__row">
                <MapPin aria-hidden="true" />
                <span>{item.recipientAddress}</span>
              </span>
              <span className="cp-delivery-card__meta">
                <span className="cp-delivery-card__row">
                  <Phone aria-hidden="true" />
                  <span>{item.recipientPhone}</span>
                </span>
                <span className="cp-delivery-card__row">
                  <Clock3 aria-hidden="true" />
                  <time dateTime={item.assignedAt}>Assigned {formatTime(item.assignedAt)}</time>
                </span>
              </span>
              <ChevronRight className="cp-delivery-card__chevron" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
