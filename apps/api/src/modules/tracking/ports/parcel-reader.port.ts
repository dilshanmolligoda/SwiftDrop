import type { ParcelReadRecord } from '../domain/parcel.types.js';

/** Private storage port. Bound only to authenticated customer-scoped queries. */
export abstract class CustomerParcelReader {
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

/** Separate Phase 1 boundary; no public adapter or HTTP endpoint is registered. */
export abstract class PublicParcelReader {
  abstract findPublicParcel(
    trackingNumber: string,
  ): Promise<ParcelReadRecord | null>;
}
