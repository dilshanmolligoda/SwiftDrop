import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { env } from '../../../lib/env'
import {
  type CustomerDelivery,
  type CustomerDeliveryContextValue,
  CustomerDeliveryContext,
  type DeliveryStatus,
  type NewDeliveryInput,
  type PackageSize,
  type VerifiedDeliveryCustomer,
} from './CustomerDeliveryContext'

import { calculateDeliveryMetrics } from './customerDeliveryModel'
import { createCustomerDeliveryStore } from './customerDeliveryStore'

const STORAGE_KEY = 'swiftdrop_customer_deliveries_v5'

interface ApiParcel {
  readonly customerId: string
  readonly id: string
  readonly trackingNumber: string
  readonly senderName: string
  readonly senderAddress: string
  readonly recipientName: string
  readonly recipientAddress: string
  readonly recipientPhone: string
  readonly packageSize: PackageSize
  readonly weightKg: string | number
  readonly costLkr: string | number
  readonly status: DeliveryStatus
  readonly deliveredAt?: string | null
  readonly createdAt: string
}

export const CustomerDeliveryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useMemo(() => createCustomerDeliveryStore({
    apiBaseUrl: env.apiBaseUrl,
    clearLegacyCache: () => {
      try {
        // The old cache had no verified owner. Never restore or persist private data there.
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Storage may be unavailable in private browsing.
      }
    },
  }), [])
  const { deliveries, metrics: apiMetrics, isLoading, error, authorizationFailed } =
    useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const openCreateModal = useCallback(() => setIsCreateModalOpen(true), [])
  const closeCreateModal = useCallback(() => setIsCreateModalOpen(false), [])
  const clearDeliveries = useCallback(() => {
    store.clear()
    setIsCreateModalOpen(false)
  }, [store])
  const setVerifiedCustomer = useCallback((customer: VerifiedDeliveryCustomer) => {
    if (store.getScope() && store.getScope()?.customerId !== customer.id) closeCreateModal()
    store.setVerifiedCustomer(customer)
  }, [store, closeCreateModal])
  const refreshDeliveries = store.refresh

  useEffect(() => () => store.clear(), [store])

  const metrics = useMemo(() => apiMetrics ?? calculateDeliveryMetrics(deliveries), [apiMetrics, deliveries])

  const createDelivery = async (input: NewDeliveryInput): Promise<CustomerDelivery> => {
    const scope = store.getScope()
    try {
      const response = await fetch(`${env.apiBaseUrl}/parcels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          senderAddress: input.senderAddress,
          recipientName: input.recipientName,
          recipientAddress: input.recipientAddress,
          recipientPhone: input.recipientPhone,
          packageSize: input.packageSize,
          weightKg: input.weightKg,
          notes: input.notes,
        }),
      })

      if (response.status === 401 || response.status === 403) store.rejectAccess(scope, response.status)

      if (response.ok) {
        const created = (await response.json()) as ApiParcel
        if (created.customerId !== scope?.customerId) store.rejectAccess(scope, 403)
        const newDelivery: CustomerDelivery = {
          id: created.id,
          trackingNumber: created.trackingNumber,
          senderName: created.senderName,
          senderAddress: created.senderAddress,
          recipientName: created.recipientName,
          recipientAddress: created.recipientAddress,
          recipientPhone: created.recipientPhone,
          packageSize: created.packageSize,
          weightKg: Number(created.weightKg),
          costLkr: Number(created.costLkr),
          status: created.status,
          createdAt: created.createdAt,
        }
        if (store.updateDeliveries(scope, previous => [newDelivery, ...previous.filter(item => item.id !== newDelivery.id)])) {
          void refreshDeliveries()
        }
        return newDelivery
      }
    } catch {
      // Backend not running or offline: fallback to local simulation
    }

    const randomTrackingNumber = `SD-${Math.floor(10000 + Math.random() * 90000)}`
    const fallbackDelivery: CustomerDelivery = {
      id: `del-${Date.now()}`,
      trackingNumber: randomTrackingNumber,
      senderName: input.senderName || 'Jane Doe',
      senderAddress: input.senderAddress,
      recipientName: input.recipientName,
      recipientAddress: input.recipientAddress,
      recipientPhone: input.recipientPhone,
      packageSize: input.packageSize,
      weightKg: input.weightKg,
      costLkr: input.costLkr ?? (input.packageSize === 'SMALL' ? 350 : input.packageSize === 'MEDIUM' ? 650 : 950),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    }

    store.updateDeliveries(scope, previous => [fallbackDelivery, ...previous])
    return fallbackDelivery
  }

  const updateDeliveryStatus = (id: string, status: DeliveryStatus): void => {
    store.updateDeliveries(store.getScope(), (previous) =>
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
    isLoading,
    error,
    authorizationFailed,
    isCreateModalOpen,
    openCreateModal,
    closeCreateModal,
    createDelivery,
    updateDeliveryStatus,
    refreshDeliveries,
    setVerifiedCustomer,
    clearDeliveries,
  }

  return (
    <CustomerDeliveryContext.Provider value={contextValue}>
      {children}
    </CustomerDeliveryContext.Provider>
  )
}
