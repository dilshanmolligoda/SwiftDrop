import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { ReceiptReader } from './receipt-reader.port.js';
import type { OwnedReceiptRecord } from './receipt.types.js';
import { InvalidReceiptDataError } from './receipt-validation.js';

/** Preserve the stored Decimal(10,2), without floating point multiplication. */
function recordedFeeMinor(value: Prisma.Decimal): number {
  if (!Prisma.Decimal.isDecimal(value)) {
    throw new InvalidReceiptDataError('deliveryFeeMinor');
  }
  const amount = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(value.toString());
  if (!amount) throw new InvalidReceiptDataError('deliveryFeeMinor');
  const cents =
    BigInt(amount[1]) * 100n + BigInt((amount[2] ?? '').padEnd(2, '0'));
  return Number(cents); // Decimal(10,2) is bounded below Number.MAX_SAFE_INTEGER.
}

function instant(value: Date, field: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new InvalidReceiptDataError(field);
  }
  return value.toISOString();
}

@Injectable()
export class ReceiptPrismaReader extends ReceiptReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findCustomerReceipt(
    customerId: string,
    parcelId: string,
  ): Promise<OwnedReceiptRecord | null> {
    const parcel = await this.prisma.parcel.findFirst({
      where: { id: parcelId, customerId },
      select: {
        id: true,
        customerId: true,
        trackingNumber: true,
        createdAt: true,
        senderName: true,
        senderAddress: true,
        recipientName: true,
        recipientAddress: true,
        recipientPhone: true,
        costLkr: true,
        status: true,
        deliveredAt: true,
      },
    });
    // Check the storage boundary before reading/validating private receipt data.
    if (!parcel || parcel.id !== parcelId || parcel.customerId !== customerId)
      return null;
    return {
      parcelId: parcel.id,
      customerId: parcel.customerId,
      receipt: {
        // A separate receipt/invoice number is not persisted. Label this as the
        // parcel reference in the PDF, rather than generating a new number.
        reference: parcel.id,
        trackingNumber: parcel.trackingNumber,
        bookedAt: instant(parcel.createdAt, 'bookedAt'),
        sender: { name: parcel.senderName },
        recipient: { name: parcel.recipientName, phone: parcel.recipientPhone },
        pickupAddress: parcel.senderAddress,
        destinationAddress: parcel.recipientAddress,
        deliveryFeeMinor: recordedFeeMinor(parcel.costLkr),
        currency: 'LKR', // Currency is explicit in the persisted costLkr column.
        deliveryStatus: parcel.status,
        ...(parcel.deliveredAt == null
          ? {}
          : { deliveredAt: instant(parcel.deliveredAt, 'deliveredAt') }),
      },
    };
  }
}
