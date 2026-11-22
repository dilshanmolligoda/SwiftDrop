import { useState } from 'react'
import { useParcelRealtime } from '../../../lib/realtime/useParcelRealtime'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Info,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  User,
  X,
} from 'lucide-react'
import { ApiError } from '../../../api/client'
import { DeliveryProgress } from '../components/DeliveryProgress'
import { DeliveryTimeline } from '../components/DeliveryTimeline'
import { ProofList } from '../components/ProofList'
import { ErrorAlert, ErrorState, LoadingState } from '../components/StateViews'
import { StatusActionPanel } from '../components/StatusActionPanel'
import { StatusBadge } from '../components/StatusBadge'
import { useDeliveryDetails } from '../hooks/useCourierData'
import type { DeliveryDetails } from '../types/courier.types'
import { formatDateTime, formatWeight, isUuid } from '../utils/format'
import './CourierPages.css'

const BACK_LINK = (
  <Link to="/courier/deliveries" className="cp-back-link">
    <ArrowLeft aria-hidden="true" />
    Back to my deliveries
  </Link>
)

export function DeliveryDetailsPage() {
  const { parcelId } = useParams()

  if (!isUuid(parcelId)) {
    return (
      <div className="cp-page">
        {BACK_LINK}
        <div className="cp-card">
          <ErrorState
            error={new ApiError(404, ['Delivery not found'])}
            action={
              <Link to="/courier/deliveries" className="cp-btn cp-btn--soft">
                View my deliveries
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  // Keyed so notices and form state reset when navigating between deliveries.
  return <DeliveryDetailsView key={parcelId} parcelId={parcelId} />
}

function DeliveryDetailsView({ parcelId }: { readonly parcelId: string }) {
  const { data, error, isLoading, reload } = useDeliveryDetails(parcelId)
  const [notice, setNotice] = useState<string | null>(null)
  // Live: reload if this parcel changes elsewhere (keeps the current view while loading).
  useParcelRealtime({ subscription: { scope: 'parcel', parcelId }, onChange: reload })

  const handleCompleted = (message: string) => {
    setNotice(message)
    reload()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!data) {
    return (
      <div className="cp-page">
        {BACK_LINK}
        <div className="cp-card">
          {error ? (
            <ErrorState
              error={error}
              onRetry={error.status === 404 ? undefined : reload}
              action={
                error.status === 404 ? (
                  <Link to="/courier/deliveries" className="cp-btn cp-btn--soft">
                    View my deliveries
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <LoadingState label="Loading delivery…" />
          )}
        </div>
      </div>
    )
  }

  const deliveredProofId = data.events.find((event) => event.status === 'DELIVERED')?.proof?.id ?? null

  return (
    <div className="cp-page">
      <div className="cp-details-topline">
        {BACK_LINK}
        <button type="button" className="cp-btn cp-btn--ghost cp-btn--sm" onClick={reload} disabled={isLoading}>
          <RefreshCw className={isLoading ? 'cp-spin' : undefined} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {notice && (
        <div className="cp-alert cp-alert--success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <p className="cp-alert__body">{notice}</p>
          <button type="button" className="cp-alert__dismiss" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      {error && <ErrorAlert error={error} />}

      <div className={`cp-details ${isLoading ? 'cp-details--refreshing' : ''}`} aria-busy={isLoading}>
        <DeliveryHeader delivery={data} />

        <div className="cp-details__grid">
          <div className="cp-details__main">
            <RecipientCard delivery={data} />
            <ParcelCard delivery={data} />
            <div className="cp-details__timeline">
              <DeliveryTimeline events={data.events} />
            </div>
          </div>
          <aside className="cp-details__side" aria-label="Delivery actions">
            <div className="cp-details__actions">
              <StatusActionPanel delivery={data} onCompleted={handleCompleted} onRefresh={reload} />
            </div>
            <div className="cp-details__proofs">
              <ProofList proofs={data.proofs} deliveredProofId={deliveredProofId} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function DeliveryHeader({ delivery }: { readonly delivery: DeliveryDetails }) {
  return (
    <section className="cp-card cp-details-header" aria-labelledby="cp-delivery-title">
      <div className="cp-details-header__top">
        <div>
          <p className="cp-details-header__eyebrow">Tracking number</p>
          <h1 id="cp-delivery-title" className="cp-details-header__tracking">
            {delivery.trackingNumber}
          </h1>
          <p className="cp-details-header__meta">
            Assigned {formatDateTime(delivery.assignment.assignedAt)}
          </p>
        </div>
        <StatusBadge status={delivery.status} size="md" />
      </div>
      <DeliveryProgress status={delivery.status} />
    </section>
  )
}

function RecipientCard({ delivery }: { readonly delivery: DeliveryDetails }) {
  const { recipient } = delivery
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(recipient.address)}`

  return (
    <section className="cp-card cp-details__recipient" aria-labelledby="cp-recipient-title">
      <header className="cp-card__header">
        <h2 id="cp-recipient-title" className="cp-card__title">
          <User aria-hidden="true" />
          Recipient
        </h2>
      </header>
      <div className="cp-card__body">
        <dl className="cp-info-list">
          <div className="cp-info-list__row">
            <dt>
              <User aria-hidden="true" />
              Name
            </dt>
            <dd className="cp-info-list__strong">{recipient.name}</dd>
          </div>
          <div className="cp-info-list__row">
            <dt>
              <Phone aria-hidden="true" />
              Contact
            </dt>
            <dd>
              <a href={`tel:${recipient.phone}`} className="cp-link">
                {recipient.phone}
              </a>
            </dd>
          </div>
          <div className="cp-info-list__row">
            <dt>
              <MapPin aria-hidden="true" />
              Address
            </dt>
            <dd>
              <span className="cp-info-list__address">{recipient.address}</span>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="cp-link cp-link--small">
                Open in Maps
                <ExternalLink aria-hidden="true" />
                <span className="cp-sr-only">(opens in a new tab)</span>
              </a>
            </dd>
          </div>
        </dl>

        <div className={`cp-instructions ${recipient.instructions ? '' : 'cp-instructions--empty'}`}>
          <p className="cp-instructions__title">
            <Info aria-hidden="true" />
            Delivery instructions
          </p>
          <p className="cp-instructions__text">{recipient.instructions ?? 'No special instructions provided.'}</p>
        </div>

        <div className="cp-quick-actions">
          <a href={`tel:${recipient.phone}`} className="cp-btn cp-btn--soft">
            <Phone aria-hidden="true" />
            Call recipient
          </a>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="cp-btn cp-btn--ghost">
            <MapPin aria-hidden="true" />
            Navigate
            <span className="cp-sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
    </section>
  )
}

function ParcelCard({ delivery }: { readonly delivery: DeliveryDetails }) {
  return (
    <section className="cp-card cp-details__parcel" aria-labelledby="cp-parcel-title">
      <header className="cp-card__header">
        <h2 id="cp-parcel-title" className="cp-card__title">
          <Package aria-hidden="true" />
          Parcel information
        </h2>
      </header>
      <div className="cp-card__body">
        <dl className="cp-info-grid">
          <div>
            <dt>Contents</dt>
            <dd>{delivery.parcel.contentsDescription ?? 'Not specified'}</dd>
          </div>
          <div>
            <dt>Weight</dt>
            <dd>{formatWeight(delivery.parcel.weightGrams)}</dd>
          </div>
          <div>
            <dt>Current status</dt>
            <dd>
              <StatusBadge status={delivery.status} />
            </dd>
          </div>
          <div>
            <dt>Status updates</dt>
            <dd>{delivery.events.length}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
