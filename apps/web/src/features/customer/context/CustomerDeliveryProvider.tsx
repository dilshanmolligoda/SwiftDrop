import React, { useEffect, useMemo, useState } from 'react'
import {
  type CustomerDelivery,
  type CustomerDeliveryContextValue,
  CustomerDeliveryContext,
  type DeliveryMetrics,
  type DeliveryStatus,
  type NewDeliveryInput,
} from './CustomerDeliveryContext'

const STORAGE_KEY = 'swiftdrop_customer_deliveries_v2'

const INITIAL_DELIVERIES: readonly CustomerDelivery[] = []

export const CustomerDeliveryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deliveries, setDeliveries] = useState<CustomerDelivery[]>(() => {
    try {
      const persistedJson = localStorage.getItem(STORAGE_KEY)
      if (persistedJson !== null) {
        const parsed = JSON.parse(persistedJson) as CustomerDelivery[]
        if (Array.isArray(parsed)) {
          return parsed
        }
      }
    } catch {
      // Fallback to initial seeds
    }
    return [...INITIAL_DELIVERIES]
  })

  // Synchronize deliveries to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deliveries))
    } catch {
      // Handle storage quota
    }
  }, [deliveries])

  // Dynamically compute the 3 key delivery metrics from current delivery records
  const metrics = useMemo<DeliveryMetrics>(() => {
    const activeDeliveries = deliveries.filter((item) =>
      ['PENDING', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(item.status),
    ).length

    const deliveredThisMonth = deliveries.filter((item) => item.status === 'DELIVERED').length

    const needsAttention = deliveries.filter((item) =>
      ['FAILED', 'RETURNED'].includes(item.status),
    ).length

    return {
      activeDeliveries,
      deliveredThisMonth,
      needsAttention,
    }
  }, [deliveries])

  const createDelivery = (input: NewDeliveryInput): CustomerDelivery => {
    const randomTrackingNumber = `SD-COL-${Math.floor(10000 + Math.random() * 90000)}`
    const newDelivery: CustomerDelivery = {
      id: `del-${Date.now()}`,
      trackingNumber: randomTrackingNumber,
      senderName: input.senderName,
      senderAddress: input.senderAddress,
      recipientName: input.recipientName,
      recipientAddress: input.recipientAddress,
      recipientPhone: input.recipientPhone,
      packageSize: input.packageSize,
      weightKg: input.weightKg,
      costLkr: input.costLkr,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    }

    setDeliveries((previous) => [newDelivery, ...previous])
    return newDelivery
  }

  const updateDeliveryStatus = (id: string, status: DeliveryStatus): void => {
    setDeliveries((previous) =>
      previous.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            status,
            deliveredAt: status === 'DELIVERED' ? new Date().toISOString() : item.deliveredAt,
          }
        }
        return item
      }),
    )
  }

  const contextValue: CustomerDeliveryContextValue = {
    deliveries,
    metrics,
    createDelivery,
    updateDeliveryStatus,
  }

  return (
    <CustomerDeliveryContext.Provider value={contextValue}>
      {children}
    </CustomerDeliveryContext.Provider>
  )
}
