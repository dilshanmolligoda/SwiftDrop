/**
 * Enum values shared across apps. They mirror the Prisma enums in
 * apps/api/prisma/schema.prisma. When a Prisma enum changes, change it here in
 * the same PR (the API will get a test that checks they match).
 *
 * Plain `as const` objects (not TypeScript `enum`) so the web app, which builds
 * with `erasableSyntaxOnly`, can use them too.
 */

export const ParcelStatus = {
  CREATED: 'CREATED',
  ASSIGNED: 'ASSIGNED',
  PENDING: 'PENDING',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  RETURNED: 'RETURNED',
} as const;
export type ParcelStatus = (typeof ParcelStatus)[keyof typeof ParcelStatus];

export const DeliveryFailureReason = {
  RECIPIENT_UNAVAILABLE: 'RECIPIENT_UNAVAILABLE',
  INCORRECT_ADDRESS: 'INCORRECT_ADDRESS',
  RECIPIENT_REJECTED: 'RECIPIENT_REJECTED',
  UNABLE_TO_CONTACT: 'UNABLE_TO_CONTACT',
  OTHER: 'OTHER',
} as const;
export type DeliveryFailureReason =
  (typeof DeliveryFailureReason)[keyof typeof DeliveryFailureReason];

export const Role = {
  CUSTOMER: 'CUSTOMER',
  MERCHANT: 'MERCHANT',
  COURIER: 'COURIER',
  DISPATCHER: 'DISPATCHER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

const PARCEL_STATUS_VALUES: ReadonlySet<string> = new Set(
  Object.values(ParcelStatus),
);
const FAILURE_REASON_VALUES: ReadonlySet<string> = new Set(
  Object.values(DeliveryFailureReason),
);

export function isParcelStatus(value: unknown): value is ParcelStatus {
  return typeof value === 'string' && PARCEL_STATUS_VALUES.has(value);
}

export function isDeliveryFailureReason(
  value: unknown,
): value is DeliveryFailureReason {
  return typeof value === 'string' && FAILURE_REASON_VALUES.has(value);
}
