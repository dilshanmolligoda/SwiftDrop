import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { env } from '../../../lib/env'
import { useCustomerDeliveries } from '../context/useCustomerDeliveries'
import { useCustomerProfile } from '../context/useCustomerProfile'
import type { PackageSize } from '../context/CustomerDeliveryContext'

export const CreateDeliveryModal: React.FC = () => {
  const { isCreateModalOpen, closeCreateModal, createDelivery } = useCustomerDeliveries()
  const { profile } = useCustomerProfile()

  const [newRecipientName, setNewRecipientName] = useState('')
  const [newRecipientAddress, setNewRecipientAddress] = useState('')
  const [newRecipientPhone, setNewRecipientPhone] = useState('')
  const [newPackageSize, setNewPackageSize] = useState<PackageSize>('MEDIUM')
  const [newWeight, setNewWeight] = useState(1.5)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Pricing Estimator State
  const [estimatedPrice, setEstimatedPrice] = useState<{
    totalCostLkr: number
    baseFee: number
    weightSurcharge: number
    estimatedDays: number
    zoneCategory: string
  } | null>(null)

  // Query live pricing engine whenever destination address, size, or weight changes
  useEffect(() => {
    if (!isCreateModalOpen) return
    let active = true

    const fetchEstimate = async (): Promise<void> => {
      try {
        const res = await fetch(`${env.apiBaseUrl}/pricing/estimate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickupAddress: 'Colombo 03',
            deliveryAddress: newRecipientAddress || 'Colombo 01',
            weightKg: newWeight,
            packageSize: newPackageSize,
          }),
        })
        if (res.ok && active) {
          const data = (await res.json()) as {
            totalCostLkr: number
            baseFee: number
            weightSurcharge: number
            estimatedDays: number
            zoneCategory: string
          }
          setEstimatedPrice(data)
          return
        }
      } catch {
        // Fallback calculation matching backend pricing engine
      }

      if (active) {
        const isLocalColombo = /colombo\s*(0?[1-9]|1[0-5])/i.test(newRecipientAddress || 'Colombo 01')
        const isWesternProvince = /(gampaha|kalutara|dehiwala|nugegoda|maharagama)/i.test(newRecipientAddress)
        let baseFee = 650
        let estimatedDays = 2
        let zoneCategory = 'OUTSTATION'
        if (isLocalColombo) {
          baseFee = 350
          estimatedDays = 1
          zoneCategory = 'LOCAL_COLOMBO'
        } else if (isWesternProvince) {
          baseFee = 450
          estimatedDays = 1
          zoneCategory = 'WESTERN_PROVINCE'
        }
        const extraKg = Math.max(0, Math.ceil(newWeight - 1.0))
        const weightSurcharge = extraKg * 100
        let sizeMultiplier = 1.0
        if (newPackageSize === 'MEDIUM') sizeMultiplier = 1.2
        if (newPackageSize === 'LARGE') sizeMultiplier = 1.5
        const totalCostLkr = Math.round((baseFee + weightSurcharge) * sizeMultiplier)
        setEstimatedPrice({
          baseFee,
          weightSurcharge,
          estimatedDays,
          zoneCategory,
          totalCostLkr,
        })
      }
    }

    void fetchEstimate()
    return () => {
      active = false
    }
  }, [isCreateModalOpen, newRecipientAddress, newPackageSize, newWeight])

  if (!isCreateModalOpen) return null

  const handleCreateDeliverySubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!newRecipientName || !newRecipientAddress || isSubmitting) return

    setIsSubmitting(true)
    try {
      await createDelivery({
        senderName: profile.fullName || 'Jane Doe',
        senderAddress: 'Colombo 03',
        recipientName: newRecipientName,
        recipientAddress: newRecipientAddress,
        recipientPhone: newRecipientPhone || '+94 77 000 0000',
        packageSize: newPackageSize,
        weightKg: newWeight,
        costLkr: estimatedPrice?.totalCostLkr,
      })

      closeCreateModal()
      setNewRecipientName('')
      setNewRecipientAddress('')
      setNewRecipientPhone('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={closeCreateModal}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-delivery-title"
      >
        <div className="modal-header">
          <div>
            <h3 id="create-delivery-title" className="modal-title">
              Create Delivery Request
            </h3>
            <p className="modal-subtitle">Schedule a pickup and book instant courier dispatch</p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={closeCreateModal}
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreateDeliverySubmit} className="modal-form">
          <div className="modal-form-group">
            <label htmlFor="create-recipient-name" className="modal-label">
              Recipient Name
            </label>
            <input
              id="create-recipient-name"
              type="text"
              required
              value={newRecipientName}
              onChange={(e) => setNewRecipientName(e.target.value)}
              placeholder="e.g. Sunil Perera"
              className="modal-input"
            />
          </div>

          <div className="modal-form-group">
            <label htmlFor="create-recipient-address" className="modal-label">
              Delivery Destination Address
            </label>
            <input
              id="create-recipient-address"
              type="text"
              required
              value={newRecipientAddress}
              onChange={(e) => setNewRecipientAddress(e.target.value)}
              placeholder="Street, City, Postal Code"
              className="modal-input"
            />
          </div>

          <div className="modal-form-row">
            <div className="modal-form-group">
              <label htmlFor="create-recipient-phone" className="modal-label">
                Contact Phone
              </label>
              <input
                id="create-recipient-phone"
                type="tel"
                value={newRecipientPhone}
                onChange={(e) => setNewRecipientPhone(e.target.value)}
                placeholder="+94 77 123 4567"
                className="modal-input"
              />
            </div>

            <div className="modal-form-row">
              <div className="modal-form-group">
                <label htmlFor="create-package-size" className="modal-label">
                  Package Size
                </label>
                <select
                  id="create-package-size"
                  value={newPackageSize}
                  onChange={(e) => setNewPackageSize(e.target.value as PackageSize)}
                  className="modal-input"
                >
                  <option value="SMALL">Small (under 1 kg)</option>
                  <option value="MEDIUM">Medium (1 - 5 kg)</option>
                  <option value="LARGE">Large (5+ kg)</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label htmlFor="create-package-weight" className="modal-label">
                  Weight (kg)
                </label>
                <input
                  id="create-package-weight"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={newWeight}
                  onChange={(e) => setNewWeight(parseFloat(e.target.value) || 1.0)}
                  className="modal-input"
                />
              </div>
            </div>
          </div>

          {estimatedPrice && (
            <div className="modal-estimate-box">
              <div className="modal-estimate-main">
                <span className="modal-estimate-label">Estimated Delivery Fee</span>
                <span className="modal-estimate-price">
                  LKR {estimatedPrice.totalCostLkr.toLocaleString()}
                </span>
              </div>
              <div className="modal-estimate-meta">
                <span>
                  {estimatedPrice.zoneCategory === 'LOCAL_COLOMBO'
                    ? 'Local Colombo'
                    : estimatedPrice.zoneCategory === 'WESTERN_PROVINCE'
                      ? 'Western Province'
                      : 'Outstation'}{' '}
                  • {estimatedPrice.estimatedDays} business day
                  {estimatedPrice.estimatedDays > 1 ? 's' : ''} delivery
                </span>
                <span className="modal-estimate-tag">Instant Quote</span>
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button
              type="button"
              onClick={closeCreateModal}
              className="modal-btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="modal-btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Booking...' : 'Book Delivery'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateDeliveryModal

