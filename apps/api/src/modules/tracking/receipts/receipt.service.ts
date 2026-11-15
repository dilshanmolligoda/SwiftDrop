import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { requireCustomer } from '../services/customer-access.js';
import { ReceiptReader } from './receipt-reader.port.js';
import { ReceiptPdfService } from './receipt-pdf.service.js';
import type { ReceiptDownload } from './receipt.types.js';
import { validateReceiptData } from './receipt-validation.js';

/** Authorization orchestration only; no controller or persistent adapter is registered. */
@Injectable()
export class ReceiptService {
  constructor(
    @Inject(ReceiptReader) private readonly reader: ReceiptReader,
    @Inject(ReceiptPdfService) private readonly pdf: ReceiptPdfService,
  ) {}

  async getCustomerReceipt(
    user: AuthenticatedUser | null | undefined,
    parcelId: unknown,
  ): Promise<ReceiptDownload> {
    const customerId = requireCustomer(user);
    if (typeof parcelId !== 'string' || !isUUID(parcelId)) {
      throw new BadRequestException('Invalid parcel ID');
    }
    const record = await this.reader.findCustomerReceipt(customerId, parcelId);
    if (
      !record ||
      record.customerId !== customerId ||
      record.parcelId !== parcelId
    ) {
      throw new NotFoundException('Receipt not found');
    }
    // Validate and format only AFTER owner/parcel checks. No request payload can
    // supply receipt fields, money, or an ownership ID through this API.
    const data = validateReceiptData(record.receipt);
    const bytes = await this.pdf.generateFromTrustedData(data);
    return {
      bytes,
      filename: `swiftdrop-receipt-${data.trackingNumber}.pdf`,
      contentType: 'application/pdf',
      cacheControl: 'private, no-store',
    };
  }
}
