import { useContext } from 'react'
import { CustomerProfileContext, type CustomerProfileContextValue } from './CustomerProfileContext'

/**
 * Custom hook to access and update customer profile state.
 * Throws an explicit error if called outside a CustomerProfileProvider.
 */
export const useCustomerProfile = (): CustomerProfileContextValue => {
  const context = useContext(CustomerProfileContext)
  if (!context) {
    throw new Error('useCustomerProfile must be used within a CustomerProfileProvider')
  }
  return context
}
