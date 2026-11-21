import { useContext } from 'react'
import {
  CustomerDeliveryContext,
  type CustomerDeliveryContextValue,
} from './CustomerDeliveryContext'

/**
 * Custom hook to access customer delivery list, dynamic metrics, and delivery operations.
 * Throws an explicit error if invoked outside a CustomerDeliveryProvider.
 */
export const useCustomerDeliveries = (): CustomerDeliveryContextValue => {
  const context = useContext(CustomerDeliveryContext)
  if (!context) {
    throw new Error('useCustomerDeliveries must be used within a CustomerDeliveryProvider')
  }
  return context
}
