export interface ReceiptParty {
  readonly name: string;
  readonly phone?: string;
}

/** Server-side booking record. This is NOT an HTTP request DTO or payment proof. */
export interface ReceiptData {
  readonly reference: string;
  readonly trackingNumber: string;
  readonly bookedAt: string;
  readonly sender: ReceiptParty;
  readonly recipient: ReceiptParty;
  readonly pickupAddress: string;
  readonly destinationAddress: string;
  /** Recorded integer minor units (100 cents = LKR 1), never a float in rupees. */
  readonly deliveryFeeMinor: number;
  readonly currency: 'LKR';
  /** Opaque source status: no canonical state-machine mapping is assumed. */
  readonly deliveryStatus?: string;
  readonly deliveredAt?: string;
}

export interface OwnedReceiptRecord {
  readonly parcelId: string;
  readonly customerId: string;
  readonly receipt: ReceiptData;
}

/** Formatting-only projection. It deliberately contains no ownership IDs. */
export interface ReceiptDocument {
  readonly company: 'SwiftDrop';
  readonly title: 'Delivery receipt';
  readonly reference: string;
  readonly trackingNumber: string;
  readonly bookingDate: string;
  readonly deliveryDate?: string;
  readonly deliveryStatus: string;
  readonly sender: ReceiptParty;
  readonly recipient: ReceiptParty;
  readonly pickupAddress: string;
  readonly destinationAddress: string;
  readonly chargeLabel: 'Recorded delivery fee';
  readonly formattedCharge: string;
  readonly note: string;
}

export interface ReceiptDownload {
  readonly bytes: Buffer;
  readonly filename: string;
  readonly contentType: 'application/pdf';
  readonly cacheControl: 'private, no-store';
}
