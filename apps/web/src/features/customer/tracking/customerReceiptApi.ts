import { env } from '../../../lib/env'
import { CustomerApiError } from './customerTrackingApi'

export interface CustomerReceiptDownload {
  readonly blob: Blob
  readonly filename: string
}

function receiptFilename(disposition: string | null): string {
  const filename = disposition?.match(/^attachment;\s*filename="(swiftdrop-receipt-([A-Z0-9]+(?:-[A-Z0-9]+)*)\.pdf)"$/i)
  return filename && filename[2].length <= 64 ? filename[1] : 'swiftdrop-receipt.pdf'
}

/** The server chooses the owner, receipt contents, and amount from persisted data. */
export async function getCustomerReceipt(parcelId: string, signal: AbortSignal): Promise<CustomerReceiptDownload> {
  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}/customer/deliveries/${encodeURIComponent(parcelId)}/receipt`, {
      method: 'GET', credentials: 'include', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new CustomerApiError(0, 'Unable to connect to SwiftDrop. Please check your connection and try again.')
  }
  if (!response.ok) {
    const message = response.status === 401 ? 'Your session has expired. Please sign in again.'
      : response.status === 403 ? 'Your account cannot download customer receipts.'
        : response.status === 404 ? 'Receipt not found. Refresh your deliveries and try again.'
          : response.status === 503 ? 'A receipt is currently unavailable for this parcel. Please try again later.'
            : response.status === 400 ? 'This parcel reference is invalid. Refresh your deliveries and try again.'
              : 'SwiftDrop could not generate the receipt. Please try again.'
    throw new CustomerApiError(response.status, message)
  }
  if (!/^application\/pdf(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')) {
    throw new CustomerApiError(0, 'SwiftDrop returned an invalid receipt. Please try again.')
  }
  let blob: Blob
  try {
    blob = await response.blob()
    const signature = new Uint8Array(await blob.slice(0, 5).arrayBuffer())
    if (blob.size < 5 || String.fromCharCode(...signature) !== '%PDF-') {
      throw new CustomerApiError(0, 'SwiftDrop returned an invalid receipt. Please try again.')
    }
  } catch (error) {
    if (signal.aborted || error instanceof CustomerApiError) throw error
    throw new CustomerApiError(0, 'The receipt download was interrupted. Please try again.')
  }
  return { blob, filename: receiptFilename(response.headers.get('Content-Disposition')) }
}

/** Saves the actual response bytes; URLs are temporary and never persisted. */
export function saveCustomerReceipt(receipt: CustomerReceiptDownload, signal: AbortSignal): void {
  if (signal.aborted) return
  const url = URL.createObjectURL(receipt.blob)
  let link: HTMLAnchorElement | undefined
  try {
    link = document.createElement('a')
    link.href = url
    link.download = receipt.filename
    document.body.appendChild(link)
    link.click()
  } finally {
    link?.remove()
    // Let the browser start consuming the blob before revoking its URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
