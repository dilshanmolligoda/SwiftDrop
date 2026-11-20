import { useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, Clock3, Loader2, PackageX, Truck, XCircle } from 'lucide-react'
import { useCourierMutation } from '../hooks/useCourierMutation'
import { courierApi } from '../services/courierApi'
import type { DeliveryDetails, ParcelStatus } from '../types/courier.types'
import { FAILURE_REASON_LABELS, STATUS_ACTIONS, STATUS_LABELS, getNextStatuses } from '../utils/deliveryStatus'
import { formatDateTime } from '../utils/format'
import { ConflictAlert } from './ConflictAlert'
import { DeliveryCompletionForm } from './DeliveryCompletionForm'
import { FailureReportForm } from './FailureReportForm'
import { NoteField } from './NoteField'
import './DeliveryActions.css'

interface StatusActionPanelProps {
  readonly delivery: DeliveryDetails
  /** Called after a successful change; the page refreshes the delivery. */
  readonly onCompleted: (message: string) => void
  readonly onRefresh: () => void
}

type Outcome = 'DELIVERED' | 'FAILED'

/** Shows only the transitions the API allows from the current status. */
export function StatusActionPanel({ delivery, onCompleted, onRefresh }: StatusActionPanelProps) {
  const nextStatuses = getNextStatuses(delivery.status)
  const isFinalStep = nextStatuses.includes('DELIVERED')

  return (
    <section className="cp-card cp-actions" aria-labelledby="cp-actions-title">
      <header className="cp-card__header">
        <div>
          <h2 id="cp-actions-title" className="cp-card__title">
            <Truck aria-hidden="true" />
            Update status
          </h2>
          <p className="cp-card__subtitle">
            Current status: <strong>{STATUS_LABELS[delivery.status]}</strong>
          </p>
        </div>
      </header>
      <div className="cp-card__body">
        {nextStatuses.length === 0 ? (
          <TerminalState delivery={delivery} />
        ) : isFinalStep ? (
          <OutcomeChooser delivery={delivery} onCompleted={onCompleted} onRefresh={onRefresh} />
        ) : (
          nextStatuses.map((status) => (
            <TransitionForm
              key={status}
              delivery={delivery}
              nextStatus={status}
              onCompleted={onCompleted}
              onRefresh={onRefresh}
            />
          ))
        )}
      </div>
    </section>
  )
}

interface TransitionFormProps extends StatusActionPanelProps {
  readonly nextStatus: ParcelStatus
}

function TransitionForm({ delivery, nextStatus, onCompleted, onRefresh }: TransitionFormProps) {
  const [note, setNote] = useState('')
  const mutation = useCourierMutation(courierApi.updateStatus)
  const action = STATUS_ACTIONS[nextStatus]

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await mutation.run(delivery.id, { status: nextStatus, note: note.trim() || undefined })
    if (result) onCompleted(`Status updated to “${STATUS_LABELS[result.status]}”.`)
  }

  return (
    <form className="cp-action-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <div className="cp-next-step">
        <span className="cp-next-step__from">{STATUS_LABELS[delivery.status]}</span>
        <ArrowRight aria-hidden="true" />
        <span className="cp-next-step__to">{STATUS_LABELS[nextStatus]}</span>
      </div>
      {action && <p className="cp-action-form__description">{action.description}</p>}

      <NoteField
        label="Note"
        value={note}
        onChange={setNote}
        placeholder="Add details for the delivery history"
        disabled={mutation.isPending}
      />

      {mutation.error && <ConflictAlert error={mutation.error} onRefresh={onRefresh} />}

      <button type="submit" className="cp-btn cp-btn--block cp-btn--lg" disabled={mutation.isPending}>
        {mutation.isPending ? <Loader2 className="cp-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
        {mutation.isPending ? 'Updating…' : (action?.label ?? `Mark as ${STATUS_LABELS[nextStatus]}`)}
      </button>
    </form>
  )
}

function OutcomeChooser({ delivery, onCompleted, onRefresh }: StatusActionPanelProps) {
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  return (
    <div className="cp-outcome">
      <p className="cp-action-form__description">How did this delivery go?</p>
      <div className="cp-outcome__options" role="group" aria-label="Delivery outcome">
        <button
          type="button"
          className={`cp-outcome__option cp-outcome__option--success ${outcome === 'DELIVERED' ? 'is-selected' : ''}`}
          aria-pressed={outcome === 'DELIVERED'}
          onClick={() => setOutcome('DELIVERED')}
        >
          <CheckCircle2 aria-hidden="true" />
          <span className="cp-outcome__label">Delivered</span>
          <span className="cp-outcome__hint">Upload proof and confirm</span>
        </button>
        <button
          type="button"
          className={`cp-outcome__option cp-outcome__option--danger ${outcome === 'FAILED' ? 'is-selected' : ''}`}
          aria-pressed={outcome === 'FAILED'}
          onClick={() => setOutcome('FAILED')}
        >
          <PackageX aria-hidden="true" />
          <span className="cp-outcome__label">Could not deliver</span>
          <span className="cp-outcome__hint">Report a failed attempt</span>
        </button>
      </div>

      {outcome === 'DELIVERED' && (
        <DeliveryCompletionForm delivery={delivery} onCompleted={onCompleted} onRefresh={onRefresh} />
      )}
      {outcome === 'FAILED' && (
        <FailureReportForm delivery={delivery} onCompleted={onCompleted} onRefresh={onRefresh} />
      )}
    </div>
  )
}

function TerminalState({ delivery }: { readonly delivery: DeliveryDetails }) {
  const lastEvent = [...delivery.events].reverse().find((event) => event.status === delivery.status)

  if (delivery.status === 'DELIVERED') {
    return (
      <div className="cp-terminal cp-terminal--success">
        <CheckCircle2 aria-hidden="true" />
        <div>
          <p className="cp-terminal__title">Delivery completed</p>
          <p className="cp-terminal__text">
            {lastEvent ? `Delivered ${formatDateTime(lastEvent.createdAt)}.` : 'This parcel has been delivered.'} No
            further updates are needed.
          </p>
        </div>
      </div>
    )
  }

  if (delivery.status === 'FAILED') {
    return (
      <div className="cp-terminal cp-terminal--danger">
        <XCircle aria-hidden="true" />
        <div>
          <p className="cp-terminal__title">Delivery failed</p>
          <p className="cp-terminal__text">
            {lastEvent?.failureReason
              ? `Reason: ${FAILURE_REASON_LABELS[lastEvent.failureReason]}.`
              : 'This attempt was reported as failed.'}{' '}
            Dispatch will arrange the next step.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="cp-terminal">
      <Clock3 aria-hidden="true" />
      <div>
        <p className="cp-terminal__title">No action available</p>
        <p className="cp-terminal__text">This delivery cannot be updated from its current status.</p>
      </div>
    </div>
  )
}
