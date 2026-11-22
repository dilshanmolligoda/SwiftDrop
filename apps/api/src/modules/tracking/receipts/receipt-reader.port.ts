import type { OwnedReceiptRecord } from './receipt.types.js';

/** Ownership-scoped persisted receipt reader; never use browser or merchant data. */
export abstract class ReceiptReader {
  /** Read an authoritative booking/charge snapshot with ownership in the query. */
  abstract findCustomerReceipt(
    customerId: string,
    parcelId: string,
  ): Promise<OwnedReceiptRecord | null>;
}
