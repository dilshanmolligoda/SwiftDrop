import { useId } from 'react'
import { NOTE_MAX_LENGTH } from '../utils/deliveryStatus'

interface NoteFieldProps {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  readonly hint?: string
  readonly disabled?: boolean
}

export function NoteField({ label, value, onChange, placeholder, hint, disabled }: NoteFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const remaining = NOTE_MAX_LENGTH - value.length

  return (
    <div className="cp-field">
      <label htmlFor={id} className="cp-field__label">
        {label} <span className="cp-field__optional">(optional)</span>
      </label>
      <textarea
        id={id}
        className="cp-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={NOTE_MAX_LENGTH}
        rows={3}
        disabled={disabled}
        aria-describedby={hintId}
      />
      <span id={hintId} className="cp-field__hint cp-field__hint--split">
        <span>{hint}</span>
        <span aria-live="polite">{remaining < 200 ? `${remaining} characters left` : ''}</span>
      </span>
    </div>
  )
}
