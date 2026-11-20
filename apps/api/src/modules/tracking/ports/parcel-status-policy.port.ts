export type ParcelStatusCategory =
  'active' | 'delivered' | 'failed' | 'other-terminal';

/**
 * Query categories, not canonical parcel statuses. The future parcels owner must
 * explicitly map every supported status and reject unmapped codes.
 */
export abstract class ParcelStatusPolicy {
  abstract classify(status: string): ParcelStatusCategory;

  /** Attention is independent of terminal outcome; RETURNED must stay distinct. */
  needsAttention(status: string): boolean {
    return this.classify(status) === 'failed';
  }
}
