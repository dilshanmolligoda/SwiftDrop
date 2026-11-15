import type { OwnedReceiptRecord } from './receipt.types.js';

/** Required Nest injection token. No default, browser, or merchant adapter exists. */
export abstract class ReceiptReader {
  /** Read an authoritative booking/charge snapshot with ownership in the query. */
  abstract findCustomerReceipt(
    customerId: string,
    parcelId: string,
  ): Promise<OwnedReceiptRecord | null>;
}
