import type { ApiError } from '../../../api/client'

export interface ErrorDescription {
  readonly title: string
  readonly messages: readonly string[]
}

/** Maps API errors to courier-friendly copy. */
export function describeApiError(error: ApiError): ErrorDescription {
  switch (error.status) {
    case 0:
      return { title: 'Connection problem', messages: error.messages }
    case 401:
      return { title: 'Session expired', messages: ['Please sign in again to continue.'] }
    case 403:
      return {
        title: 'Not allowed',
        messages: ['Your account does not have permission to perform this action.'],
      }
    case 404:
      return {
        title: 'Delivery not found',
        messages: ['This delivery does not exist or is no longer assigned to you.'],
      }
    case 409:
      return {
        title: 'Status has changed',
        messages: [...error.messages, 'Refresh the delivery to see its latest status.'],
      }
    case 413:
      return { title: 'Image too large', messages: ['Proof images must be 5 MB or smaller.'] }
    case 400:
    case 422:
      return { title: 'Please check your input', messages: error.messages }
    default:
      return error.status >= 500
        ? { title: 'Server error', messages: ['Something went wrong on our side. Please try again shortly.'] }
        : { title: 'Request failed', messages: error.messages }
  }
}
