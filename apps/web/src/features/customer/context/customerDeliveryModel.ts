import type { CustomerDelivery, DeliveryMetrics } from './CustomerDeliveryContext'

export const CUSTOMER_DELIVERY_STATUSES = [
  'CREATED', 'ASSIGNED', 'PENDING', 'PICKED_UP', 'IN_TRANSIT',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED',
] as const

export type CustomerDeliveryStatus = (typeof CUSTOMER_DELIVERY_STATUSES)[number]

export const DELIVERY_STATUS_LABELS: Readonly<Record<CustomerDeliveryStatus, string>> = {
  CREATED: 'Created',
  ASSIGNED: 'Assigned',
  PENDING: 'Pending pickup',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
  RETURNED: 'Returned',
}

export function isCustomerDeliveryStatus(value: unknown): value is CustomerDeliveryStatus {
  return CUSTOMER_DELIVERY_STATUSES.some(status => status === value)
}

export function isActiveDeliveryStatus(status: CustomerDeliveryStatus): boolean {
  return status !== 'DELIVERED' && status !== 'FAILED' && status !== 'RETURNED'
}

// Assignment/booking alone never confirms pickup. No timestamp is inferred here.
export function isPickupConfirmed(status: CustomerDeliveryStatus): boolean {
  return ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)
}

export function calculateDeliveryMetrics(
  deliveries: readonly CustomerDelivery[], now = new Date(),
): DeliveryMetrics {
  return {
    activeDeliveries: deliveries.filter(item => isActiveDeliveryStatus(item.status)).length,
    deliveredThisMonth: deliveries.filter(item => {
      if (item.status !== 'DELIVERED' || !item.deliveredAt) return false
      const date = new Date(item.deliveredAt)
      return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth()
    }).length,
    needsAttention: deliveries.filter(item => item.status === 'FAILED' || item.status === 'RETURNED').length,
  }
}
