import React, { useState } from 'react'
import { X } from 'lucide-react'
import type { ZonePricingItem } from '../types/admin-pricing.types'
import styles from './ZoneModal.module.css'

interface ZoneModalProps {
  readonly isOpen: boolean
  readonly zone: ZonePricingItem | null
  readonly onClose: () => void
  readonly onSave: (zone: ZonePricingItem) => void
}

const ZoneModalContent: React.FC<{
  readonly zone: ZonePricingItem | null
  readonly onClose: () => void
  readonly onSave: (zone: ZonePricingItem) => void
}> = ({ zone, onClose, onSave }) => {
  const [name, setName] = useState(zone?.name ?? '')
  const [coveredAreas, setCoveredAreas] = useState(zone?.coveredAreas ?? '')
  const [baseFeeLkr, setBaseFeeLkr] = useState(zone?.baseFeeLkr ?? 350)
  const [extraPerKgLkr, setExtraPerKgLkr] = useState(zone?.extraPerKgLkr ?? 80)
  const [isActive, setIsActive] = useState(zone?.isActive ?? true)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      id: zone ? zone.id : `z-${Date.now()}`,
      name,
      coveredAreas,
      baseFeeLkr: Number(baseFeeLkr),
      extraPerKgLkr: Number(extraPerKgLkr),
      isActive,
    })
  }

  return (
    <div
      className={styles.modal}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="zone-modal-title"
    >
      <div className={styles.modalHeader}>
        <h2 id="zone-modal-title" className={styles.modalTitle}>
          {zone ? 'Edit Delivery Zone' : 'Add Delivery Zone'}
        </h2>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSave}>
        <div className={styles.modalBody}>
          <div className={styles.inputGroup}>
            <label htmlFor="zone-name" className={styles.label}>
              Zone name
            </label>
            <input
              id="zone-name"
              type="text"
              className={styles.input}
              placeholder="e.g. Colombo Central"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="covered-areas" className={styles.label}>
              Covered areas / Postal codes
            </label>
            <input
              id="covered-areas"
              type="text"
              className={styles.input}
              placeholder="e.g. Colombo 01–05, Fort, Pettah"
              value={coveredAreas}
              onChange={(e) => setCoveredAreas(e.target.value)}
              required
            />
          </div>

          <div className={styles.twoCols}>
            <div className={styles.inputGroup}>
              <label htmlFor="base-fee" className={styles.label}>
                Base fee (first 1 kg - LKR)
              </label>
              <input
                id="base-fee"
                type="number"
                min="0"
                step="10"
                className={styles.input}
                value={baseFeeLkr}
                onChange={(e) => setBaseFeeLkr(Number(e.target.value))}
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="extra-fee" className={styles.label}>
                Extra / kg (LKR)
              </label>
              <input
                id="extra-fee"
                type="number"
                min="0"
                step="5"
                className={styles.input}
                value={extraPerKgLkr}
                onChange={(e) => setExtraPerKgLkr(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Zone is active for customer booking and merchant dispatches</span>
          </label>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.saveBtn}>
            Save zone
          </button>
        </div>
      </form>
    </div>
  )
}

export const ZoneModal: React.FC<ZoneModalProps> = ({
  isOpen,
  zone,
  onClose,
  onSave,
}) => {
  if (!isOpen) return null

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <ZoneModalContent
        key={zone ? zone.id : 'new-zone'}
        zone={zone}
        onClose={onClose}
        onSave={onSave}
      />
    </div>
  )
}
