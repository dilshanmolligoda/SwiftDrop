import type { ParcelReadRecord } from '../domain/parcel.types.js';

/** Nest injection token and storage port. Intentionally has no default adapter. */
export abstract class ParcelReader {
  /** Public lookup still returns internal data; the service must project it. */
  abstract findPublicParcel(
    trackingNumber: string,
  ): Promise<ParcelReadRecord | null>;

  /** The real adapter must enforce customer ownership inside the storage query. */
  abstract findCustomerParcel(
    customerId: string,
    trackingNumber: string,
  ): Promise<ParcelReadRecord | null>;

  /**
   * Complete, customer-scoped snapshot for Phase 1 filtering and summaries.
   * Never return a paginated subset: that would make totals/metrics incorrect.
   * A database-paginated query port can replace this when persistence is agreed.
   */
  abstract listCustomerParcels(
    customerId: string,
  ): Promise<readonly ParcelReadRecord[]>;
}
