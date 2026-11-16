import { Camera, FileImage } from 'lucide-react'
import type { DeliveryProofSummary } from '../types/courier.types'
import { formatBytes, formatDateTime } from '../utils/format'

interface ProofListProps {
  readonly proofs: readonly DeliveryProofSummary[]
  /** Proof attached to the DELIVERED event, if any. */
  readonly deliveredProofId: string | null
}

/** Metadata for uploaded proofs. Image files are not served publicly by the API. */
export function ProofList({ proofs, deliveredProofId }: ProofListProps) {
  return (
    <section className="cp-card" aria-labelledby="cp-proofs-title">
      <header className="cp-card__header">
        <h2 id="cp-proofs-title" className="cp-card__title">
          <Camera aria-hidden="true" />
          Proof of delivery
        </h2>
      </header>
      <div className="cp-card__body">
        {proofs.length === 0 ? (
          <p className="cp-muted-text">No proof photos have been uploaded for this delivery.</p>
        ) : (
          <ul className="cp-proof-list">
            {proofs.map((proof) => (
              <li key={proof.id} className="cp-proof-list__item">
                <span className="cp-proof-list__icon" aria-hidden="true">
                  <FileImage />
                </span>
                <div className="cp-proof-list__body">
                  <p className="cp-proof-list__name" title={proof.originalFilename}>
                    {proof.originalFilename}
                  </p>
                  <p className="cp-proof-list__meta">
                    {proof.contentType.replace('image/', '').toUpperCase()} · {formatBytes(proof.sizeBytes)} ·{' '}
                    {formatDateTime(proof.uploadedAt)}
                  </p>
                  <div className="cp-proof-list__tags">
                    {proof.id === deliveredProofId && (
                      <span className="cp-tag cp-tag--success">Used for delivery</span>
                    )}
                    {proof.uploadedByCurrentCourier && <span className="cp-tag">Uploaded by you</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
