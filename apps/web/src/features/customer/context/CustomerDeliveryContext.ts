import { createContext } from 'react'

export type DeliveryStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETURNED'

export type PackageSize = 'SMALL' | 'MEDIUM' | 'LARGE'

export interface CustomerDelivery {
  readonly id: string
  readonly trackingNumber: string
  readonly senderName: string
  readonly senderAddress: string
  readonly recipientName: string
  readonly recipientAddress: string
  readonly recipientPhone: string
  readonly packageSize: PackageSize
  readonly weightKg: number
  readonly costLkr: number
  readonly status: DeliveryStatus
  readonly createdAt: string
  readonly deliveredAt?: string
}

export interface DeliveryMetrics {
  readonly activeDeliveries: number
  readonly deliveredThisMonth: number
  readonly needsAttention: number
}

export interface NewDeliveryInput {
  readonly senderName: string
  readonly senderAddress: string
  readonly recipientName: string
  readonly recipientAddress: string
  readonly recipientPhone: string
  readonly packageSize: PackageSize
  readonly weightKg: number
  readonly costLkr: number
}

export interface CustomerDeliveryContextValue {
  readonly deliveries: readonly CustomerDelivery[]
  readonly metrics: DeliveryMetrics
  readonly createDelivery: (input: NewDeliveryInput) => CustomerDelivery
  readonly updateDeliveryStatus: (id: string, status: DeliveryStatus) => void
}

export const CustomerDeliveryContext = createContext<CustomerDeliveryContextValue | undefined>(
  undefined,
)
