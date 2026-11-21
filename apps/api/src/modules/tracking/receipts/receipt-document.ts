import type { ReceiptDocument } from './receipt.types.js';
import { validateReceiptData } from './receipt-validation.js';

function formatDate(value: string): string {
  return (
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Colombo',
    }).format(new Date(value)) + ' (Sri Lanka time)'
  );
}

/** Exact formatting: no floating-point currency arithmetic or rounding. */
function formatCharge(amountMinor: number): string {
  const cents = BigInt(amountMinor);
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `LKR ${whole}.${(cents % 100n).toString().padStart(2, '0')}`;
}

export function buildReceiptDocument(trustedData: unknown): ReceiptDocument {
  const receipt = validateReceiptData(trustedData);
  return {
    company: 'SwiftDrop',
    title: 'Delivery receipt',
    reference: receipt.reference,
    trackingNumber: receipt.trackingNumber,
    bookingDate: formatDate(receipt.bookedAt),
    ...(receipt.deliveredAt === undefined
      ? {}
      : { deliveryDate: formatDate(receipt.deliveredAt) }),
    deliveryStatus: receipt.deliveryStatus ?? 'Not recorded',
    sender: receipt.sender,
    recipient: receipt.recipient,
    pickupAddress: receipt.pickupAddress,
    destinationAddress: receipt.destinationAddress,
    chargeLabel: 'Recorded delivery fee',
    formattedCharge: formatCharge(receipt.deliveryFeeMinor),
    note: 'This receipt records the booked delivery charge. It does not confirm payment.',
  };
}
