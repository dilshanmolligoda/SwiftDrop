import React, { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import { copyToClipboard } from '../utils/format'
import styles from './Dialog.module.css'

interface DialogProps {
  readonly open: boolean
  readonly title: string
  readonly onClose: () => void
  readonly children: React.ReactNode
  readonly actions: React.ReactNode
  /** Secrets must be acknowledged, so Escape and backdrop clicks do not close them. */
  readonly dismissible?: boolean
}

/** Accessible modal built on <dialog>, which traps focus and handles Escape. */
export const Dialog: React.FC<DialogProps> = ({ open, title, onClose, children, actions, dismissible = true }) => {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (dismissible) onClose()
      }}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose()
      }}
    >
      <div className={styles.body}>
        <h2 id={titleId} className={styles.title}>{title}</h2>
        {children}
        <div className={styles.actions}>{actions}</div>
      </div>
    </dialog>
  )
}

interface ConfirmDialogProps {
  readonly open: boolean
  readonly title: string
  readonly message: React.ReactNode
  readonly confirmLabel: string
  readonly busy?: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ open, title, message, confirmLabel, busy, onConfirm, onCancel }) => (
  <Dialog
    open={open}
    title={title}
    onClose={onCancel}
    actions={
      <>
        <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={styles.dangerButton} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </>
    }
  >
    <p className={styles.text}>{message}</p>
  </Dialog>
)

interface SecretDialogProps {
  readonly open: boolean
  readonly title: string
  readonly label: string
  readonly secret: string
  readonly description: React.ReactNode
  readonly onDone: () => void
}

/** Shows a secret exactly once, with a copy button and an explicit "I've saved it". */
export const SecretDialog: React.FC<SecretDialogProps> = ({ open, title, label, secret, description, onDone }) => {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    setCopied(await copyToClipboard(secret))
  }

  return (
    <Dialog
      open={open}
      title={title}
      onClose={onDone}
      dismissible={false}
      actions={
        <button type="button" className={styles.primaryButton} onClick={() => { setCopied(false); onDone() }}>
          I've saved it
        </button>
      }
    >
      <div className={styles.warning} role="note">
        <TriangleAlert size={16} aria-hidden="true" />
        <span>This is the only time it will be shown. Copy it now and store it somewhere safe.</span>
      </div>
      <p className={styles.text}>{description}</p>
      <label className={styles.secretLabel}>
        {label}
        <div className={styles.secretRow}>
          <input className={styles.secretInput} value={secret} readOnly onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className={styles.copyButton} onClick={() => void copy()}>
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </label>
    </Dialog>
  )
}
