import { createContext } from 'react'
import type { CustomerDeliveryStatus } from './customerDeliveryModel'

export type DeliveryStatus = CustomerDeliveryStatus

/** Established only by a successful /auth/me response in CustomerLayout. */
export interface VerifiedDeliveryCustomer {
  readonly id: string
  readonly role: 'CUSTOMER'
  readonly approvalStatus: 'APPROVED'
  readonly isActive: true
}

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
  readonly senderName?: string
  readonly senderAddress: string
  readonly recipientName: string
  readonly recipientAddress: string
  readonly recipientPhone: string
  readonly packageSize: PackageSize
  readonly weightKg: number
  readonly costLkr?: number
  readonly notes?: string
}

export interface CustomerDeliveryContextValue {
  readonly deliveries: readonly CustomerDelivery[]
  readonly metrics: DeliveryMetrics
  readonly isLoading: boolean
  readonly error: string | null
  readonly authorizationFailed: boolean
  readonly isCreateModalOpen: boolean
  readonly openCreateModal: () => void
  readonly closeCreateModal: () => void
  readonly createDelivery: (input: NewDeliveryInput) => Promise<CustomerDelivery>
  readonly updateDeliveryStatus: (id: string, status: DeliveryStatus) => void
  readonly refreshDeliveries: () => Promise<void>
  readonly setVerifiedCustomer: (customer: VerifiedDeliveryCustomer) => void
  readonly clearDeliveries: () => void
}

export const CustomerDeliveryContext = createContext<CustomerDeliveryContextValue | undefined>(
  undefined,
)
