import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { env } from '../../../lib/env'
import {
  type CustomerDelivery,
  type CustomerDeliveryContextValue,
  CustomerDeliveryContext,
  type DeliveryMetrics,
  type DeliveryStatus,
  type NewDeliveryInput,
  type PackageSize,
} from './CustomerDeliveryContext'

const STORAGE_KEY = 'swiftdrop_customer_deliveries_v5'

const INITIAL_DELIVERIES: readonly CustomerDelivery[] = []

interface ApiParcel {
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
  const [deliveries, setDeliveries] = useState<CustomerDelivery[]>(() => {
    try {
      const persistedJson = localStorage.getItem(STORAGE_KEY)
      if (persistedJson !== null) {
        const parsed = JSON.parse(persistedJson) as CustomerDelivery[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch {
      // Fallback to initial seeds
    }
    return [...INITIAL_DELIVERIES]
  })

  const [apiMetrics, setApiMetrics] = useState<DeliveryMetrics | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false)

  const openCreateModal = useCallback(() => setIsCreateModalOpen(true), [])
  const closeCreateModal = useCallback(() => setIsCreateModalOpen(false), [])

  // Synchronize deliveries to localStorage for offline fallback
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deliveries))
    } catch {
      // Handle storage quota
    }
  }, [deliveries])

  // Fetch deliveries and metrics from backend API
  const refreshDeliveries = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const [parcelsResponse, metricsResponse] = await Promise.all([
        fetch(`${env.apiBaseUrl}/parcels/me`, {
          method: 'GET',
          credentials: 'include',
        }),
        fetch(`${env.apiBaseUrl}/parcels/metrics`, {
          method: 'GET',
          credentials: 'include',
        }),
      ])

      if (parcelsResponse.ok) {
        const apiData = (await parcelsResponse.json()) as ApiParcel[]
        if (Array.isArray(apiData)) {
          const mapped: CustomerDelivery[] = apiData.map((p) => ({
            id: p.id,
            trackingNumber: p.trackingNumber,
            senderName: p.senderName,
            senderAddress: p.senderAddress,
            recipientName: p.recipientName,
            recipientAddress: p.recipientAddress,
            recipientPhone: p.recipientPhone,
            packageSize: p.packageSize,
            weightKg: Number(p.weightKg),
            costLkr: Number(p.costLkr),
            status: p.status,
            deliveredAt: p.deliveredAt ?? undefined,
            createdAt: p.createdAt,
          }))
          setDeliveries(mapped)
        }
      }

      if (metricsResponse.ok) {
        const metricsData = (await metricsResponse.json()) as DeliveryMetrics
        setApiMetrics(metricsData)
      }
    } catch (err) {
      // Graceful offline fallback
      setError(err instanceof Error ? err.message : 'Failed to reach API')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    const loadInitialData = async (): Promise<void> => {
      try {
        const [parcelsResponse, metricsResponse] = await Promise.all([
          fetch(`${env.apiBaseUrl}/parcels/me`, {
            method: 'GET',
            credentials: 'include',
          }),
          fetch(`${env.apiBaseUrl}/parcels/metrics`, {
            method: 'GET',
            credentials: 'include',
          }),
        ])

        if (isCancelled) return

        if (parcelsResponse.ok) {
          const apiData = (await parcelsResponse.json()) as ApiParcel[]
          if (Array.isArray(apiData) && !isCancelled) {
            const mapped: CustomerDelivery[] = apiData.map((p) => ({
              id: p.id,
              trackingNumber: p.trackingNumber,
              senderName: p.senderName,
              senderAddress: p.senderAddress,
              recipientName: p.recipientName,
              recipientAddress: p.recipientAddress,
              recipientPhone: p.recipientPhone,
              packageSize: p.packageSize,
              weightKg: Number(p.weightKg),
              costLkr: Number(p.costLkr),
              status: p.status,
              deliveredAt: p.deliveredAt ?? undefined,
              createdAt: p.createdAt,
            }))
            setDeliveries(mapped)
          }
        }

        if (metricsResponse.ok && !isCancelled) {
          const metricsData = (await metricsResponse.json()) as DeliveryMetrics
          setApiMetrics(metricsData)
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to reach API')
        }
      }
    }

    void loadInitialData()

    return () => {
      isCancelled = true
    }
  }, [])

  // Dynamically compute delivery metrics (preferring API metrics when available)
  const metrics = useMemo<DeliveryMetrics>(() => {
    if (apiMetrics) {
      return apiMetrics
    }

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
  }, [deliveries, apiMetrics])

  const createDelivery = async (input: NewDeliveryInput): Promise<CustomerDelivery> => {
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

      if (response.ok) {
        const created = (await response.json()) as ApiParcel
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
        setDeliveries((previous) => [newDelivery, ...previous])
        void refreshDeliveries()
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

    setDeliveries((previous) => [fallbackDelivery, ...previous])
    return fallbackDelivery
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
    isLoading,
    error,
    isCreateModalOpen,
    openCreateModal,
    closeCreateModal,
    createDelivery,
    updateDeliveryStatus,
    refreshDeliveries,
  }

  return (
    <CustomerDeliveryContext.Provider value={contextValue}>
      {children}
    </CustomerDeliveryContext.Provider>
  )
}
