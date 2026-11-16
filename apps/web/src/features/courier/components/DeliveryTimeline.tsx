import { History, Image as ImageIcon } from 'lucide-react'
import type { DeliveryStatusEvent } from '../types/courier.types'
import { FAILURE_REASON_LABELS, STATUS_LABELS, STATUS_TONES } from '../utils/deliveryStatus'
import { formatBytes, formatDateTime } from '../utils/format'

/** Status history, newest first. */
export function DeliveryTimeline({ events }: { readonly events: readonly DeliveryStatusEvent[] }) {
  const ordered = [...events].reverse()

  return (
    <section className="cp-card" aria-labelledby="cp-timeline-title">
      <header className="cp-card__header">
        <h2 id="cp-timeline-title" className="cp-card__title">
          <History aria-hidden="true" />
          Delivery history
        </h2>
      </header>
      <div className="cp-card__body">
        {ordered.length === 0 ? (
          <p className="cp-muted-text">No status updates have been recorded yet.</p>
        ) : (
          <ol className="cp-timeline">
            {ordered.map((event, index) => (
              <li
                key={event.id}
                className={`cp-timeline__item cp-timeline__item--${STATUS_TONES[event.status]} ${
                  index === 0 ? 'cp-timeline__item--latest' : ''
                }`}
              >
                <span className="cp-timeline__dot" aria-hidden="true" />
                <div className="cp-timeline__content">
                  <div className="cp-timeline__head">
                    <p className="cp-timeline__title">{STATUS_LABELS[event.status]}</p>
                    <time className="cp-timeline__time" dateTime={event.createdAt}>
                      {formatDateTime(event.createdAt)}
                    </time>
                  </div>
                  {event.actor && <p className="cp-timeline__actor">by {event.actor.fullName}</p>}
                  {event.failureReason && (
                    <p className="cp-timeline__reason">Reason: {FAILURE_REASON_LABELS[event.failureReason]}</p>
                  )}
                  {event.note && <p className="cp-timeline__note">{event.note}</p>}
                  {event.proof && (
                    <p className="cp-timeline__proof">
                      <ImageIcon aria-hidden="true" />
                      Proof: {event.proof.originalFilename} ({formatBytes(event.proof.sizeBytes)})
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
