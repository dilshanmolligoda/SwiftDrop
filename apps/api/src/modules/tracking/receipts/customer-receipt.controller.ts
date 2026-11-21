import {
  Controller,
  Get,
  Param,
  Res,
  ServiceUnavailableException,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '../../../generated/prisma/enums.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ReceiptFontError } from './receipt-pdf.service.js';
import { ReceiptService } from './receipt.service.js';
import { InvalidReceiptDataError } from './receipt-validation.js';

@Controller('customer/deliveries')
@Roles(Role.CUSTOMER)
export class CustomerReceiptController {
  constructor(private readonly receipts: ReceiptService) {}

  @Get(':parcelId/receipt')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId') parcelId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    try {
      const download = await this.receipts.getCustomerReceipt(user, parcelId);
      return new StreamableFile(download.bytes, {
        type: download.contentType,
        disposition: `attachment; filename="${download.filename}"`,
        length: download.bytes.length,
      });
    } catch (error) {
      if (
        error instanceof InvalidReceiptDataError ||
        error instanceof ReceiptFontError
      ) {
        throw new ServiceUnavailableException(
          'Receipt is currently unavailable for this parcel',
        );
      }
      throw error;
    }
  }
}
