import { Check, X } from 'lucide-react'
import type { ParcelStatus } from '../types/courier.types'
import { DELIVERY_STEPS, STATUS_LABELS } from '../utils/deliveryStatus'

/** Horizontal step tracker for the happy path; FAILED replaces the final step. */
export function DeliveryProgress({ status }: { readonly status: ParcelStatus }) {
  const isFailed = status === 'FAILED'
  const currentIndex = isFailed ? DELIVERY_STEPS.length - 1 : DELIVERY_STEPS.indexOf(status)

  return (
    <ol className="cp-progress" aria-label="Delivery progress">
      {DELIVERY_STEPS.map((step, index) => {
        const isLast = index === DELIVERY_STEPS.length - 1
        const label = isLast && isFailed ? STATUS_LABELS.FAILED : STATUS_LABELS[step]
        let state: 'done' | 'current' | 'upcoming' | 'failed' = 'upcoming'
        if (isLast && isFailed) state = 'failed'
        else if (index < currentIndex || (index === currentIndex && status === 'DELIVERED')) state = 'done'
        else if (index === currentIndex) state = 'current'

        return (
          <li
            key={step}
            className={`cp-progress__step cp-progress__step--${state}`}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className="cp-progress__marker" aria-hidden="true">
              {state === 'done' ? <Check /> : state === 'failed' ? <X /> : index + 1}
            </span>
            <span className="cp-progress__label">
              {label}
              <span className="cp-sr-only">
                {state === 'done' ? ' (completed)' : state === 'current' ? ' (current)' : state === 'failed' ? '' : ' (upcoming)'}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
