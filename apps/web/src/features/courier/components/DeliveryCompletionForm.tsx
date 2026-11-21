import { useState, type FormEvent } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useCourierMutation } from '../hooks/useCourierMutation'
import { courierApi } from '../services/courierApi'
import type { DeliveryDetails, ProofMetadata } from '../types/courier.types'
import { formatDateTime } from '../utils/format'
import { NoteField } from './NoteField'
import { ProofUploader } from './ProofUploader'
import { ConflictAlert } from './ConflictAlert'

interface DeliveryCompletionFormProps {
  readonly delivery: DeliveryDetails
  readonly onCompleted: (message: string) => void
  readonly onRefresh: () => void
}

/**
 * Two-step completion: upload a proof photo, then confirm DELIVERED with the
 * returned proof ID. The confirm button stays disabled until a proof exists.
 */
export function DeliveryCompletionForm({ delivery, onCompleted, onRefresh }: DeliveryCompletionFormProps) {
  const [uploadedProof, setUploadedProof] = useState<ProofMetadata | null>(null)
  const [useExistingProof, setUseExistingProof] = useState(true)
  const [note, setNote] = useState('')
  const mutation = useCourierMutation(courierApi.updateStatus)

  // A photo this courier uploaded earlier (e.g. before a page refresh) can be reused.
  const previousProof = delivery.proofs.find((proof) => proof.uploadedByCurrentCourier) ?? null
  const proofId = uploadedProof?.id ?? (useExistingProof ? previousProof?.id : undefined)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!proofId) return
    const result = await mutation.run(delivery.id, {
      status: 'DELIVERED',
      proofId,
      note: note.trim() || undefined,
    })
    if (result) onCompleted(`Delivery ${delivery.trackingNumber} completed successfully.`)
  }

  return (
    <form className="cp-action-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <fieldset className="cp-action-form__fieldset" disabled={mutation.isPending}>
        <legend className="cp-action-form__legend">
          <span className="cp-step-number" aria-hidden="true">
            1
          </span>
          Proof of delivery
        </legend>

        {previousProof && !uploadedProof && (
          <label className="cp-check">
            <input
              type="checkbox"
              checked={useExistingProof}
              onChange={(event) => setUseExistingProof(event.target.checked)}
            />
            <span>
              Use the photo you already uploaded
              <span className="cp-check__meta">
                {previousProof.originalFilename} · {formatDateTime(previousProof.uploadedAt)}
              </span>
            </span>
          </label>
        )}

        {(!previousProof || !useExistingProof || uploadedProof) && (
          <ProofUploader
            parcelId={delivery.id}
            uploadedProof={uploadedProof}
            onUploaded={setUploadedProof}
            onCleared={() => setUploadedProof(null)}
            disabled={mutation.isPending}
          />
        )}
      </fieldset>

      <fieldset className="cp-action-form__fieldset" disabled={mutation.isPending}>
        <legend className="cp-action-form__legend">
          <span className="cp-step-number" aria-hidden="true">
            2
          </span>
          Confirm hand-over
        </legend>
        <NoteField
          label="Delivery note"
          value={note}
          onChange={setNote}
          placeholder="e.g. Handed to recipient at the front door"
          hint="Visible in the delivery history."
        />
      </fieldset>

      {mutation.error && <ConflictAlert error={mutation.error} onRefresh={onRefresh} />}

      {!proofId && (
        <p className="cp-action-form__requirement" id="delivered-requirement">
          Upload a proof photo to enable delivery confirmation.
        </p>
      )}

      <button
        type="submit"
        className="cp-btn cp-btn--success cp-btn--block cp-btn--lg"
        disabled={!proofId || mutation.isPending}
        aria-describedby={!proofId ? 'delivered-requirement' : undefined}
      >
        {mutation.isPending ? <Loader2 className="cp-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
        {mutation.isPending ? 'Confirming…' : 'Confirm delivery'}
      </button>
    </form>
  )
}
