import { useId, useState, type FormEvent } from 'react'
import { AlertOctagon, Loader2 } from 'lucide-react'
import { useCourierMutation } from '../hooks/useCourierMutation'
import { courierApi } from '../services/courierApi'
import type { DeliveryDetails, DeliveryFailureReason } from '../types/courier.types'
import { FAILURE_REASONS, FAILURE_REASON_LABELS } from '../utils/deliveryStatus'
import { ConflictAlert } from './ConflictAlert'
import { NoteField } from './NoteField'

interface FailureReportFormProps {
  readonly delivery: DeliveryDetails
  readonly onCompleted: (message: string) => void
  readonly onRefresh: () => void
}

export function FailureReportForm({ delivery, onCompleted, onRefresh }: FailureReportFormProps) {
  const errorId = useId()
  const [reason, setReason] = useState<DeliveryFailureReason | null>(null)
  const [note, setNote] = useState('')
  const [showReasonError, setShowReasonError] = useState(false)
  const mutation = useCourierMutation(courierApi.reportFailure)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!reason) {
      setShowReasonError(true)
      return
    }
    const result = await mutation.run(delivery.id, { failureReason: reason, note: note.trim() || undefined })
    if (!result) return
    onCompleted(
      result.duplicate
        ? 'This failed delivery was already recorded.'
        : `Failed delivery recorded for ${delivery.trackingNumber}.`,
    )
  }

  return (
    <form className="cp-action-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <fieldset
        className="cp-action-form__fieldset"
        disabled={mutation.isPending}
        aria-describedby={showReasonError && !reason ? errorId : undefined}
      >
        <legend className="cp-action-form__legend">
          Reason for failure <span className="cp-required">*</span>
        </legend>
        <div className="cp-reasons" role="radiogroup" aria-required="true">
          {FAILURE_REASONS.map((option) => (
            <label key={option} className={`cp-reason ${reason === option ? 'cp-reason--selected' : ''}`}>
              <input
                type="radio"
                name="failureReason"
                value={option}
                checked={reason === option}
                onChange={() => {
                  setReason(option)
                  setShowReasonError(false)
                }}
              />
              <span>{FAILURE_REASON_LABELS[option]}</span>
            </label>
          ))}
        </div>
        {showReasonError && !reason && (
          <p id={errorId} className="cp-field__error" role="alert">
            Select a reason before submitting.
          </p>
        )}
      </fieldset>

      <fieldset className="cp-action-form__fieldset" disabled={mutation.isPending}>
        <legend className="cp-sr-only">Additional details</legend>
        <NoteField
          label="Additional note"
          value={note}
          onChange={setNote}
          placeholder={
            reason === 'OTHER' ? 'Describe what happened' : 'e.g. Called twice, no answer. Left a notice card.'
          }
          hint="Helps dispatch plan the next attempt."
        />
      </fieldset>

      {mutation.error && <ConflictAlert error={mutation.error} onRefresh={onRefresh} />}

      <button type="submit" className="cp-btn cp-btn--danger cp-btn--block cp-btn--lg" disabled={mutation.isPending}>
        {mutation.isPending ? <Loader2 className="cp-spin" aria-hidden="true" /> : <AlertOctagon aria-hidden="true" />}
        {mutation.isPending ? 'Submitting…' : 'Submit failure report'}
      </button>
    </form>
  )
}
