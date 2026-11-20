import { Module } from '@nestjs/common';
import { ParcelsModule } from '../parcels/parcels.module.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { PublicParcelReaderAdapter } from './adapters/public-parcel-reader.adapter.js';
import { PublicTrackingController } from './controllers/public-tracking.controller.js';
import { PublicTrackingRateLimitGuard } from './guards/public-tracking-rate-limit.guard.js';
import { PublicTrackingService } from './services/public-tracking.service.js';
import { ParcelsReaderAdapter } from './adapters/parcels-reader.adapter.js';
import { CustomerDeliveriesController } from './controllers/customer-deliveries.controller.js';
import { CustomerTrackingController } from './controllers/customer-tracking.controller.js';
import { PrismaParcelStatusPolicy } from './domain/prisma-parcel-status.policy.js';
import {
  CustomerParcelReader,
  PublicParcelReader,
} from './ports/parcel-reader.port.js';
import { ParcelStatusPolicy } from './ports/parcel-status-policy.port.js';
import { DeliveryHistoryService } from './services/delivery-history.service.js';
import { TrackingService } from './services/tracking.service.js';
import { CustomerReceiptController } from './receipts/customer-receipt.controller.js';
import { ReceiptPdfService } from './receipts/receipt-pdf.service.js';
import { ReceiptPrismaReader } from './receipts/receipt-prisma.reader.js';
import { ReceiptReader } from './receipts/receipt-reader.port.js';
import { ReceiptService } from './receipts/receipt.service.js';

@Module({
  imports: [ParcelsModule, PrismaModule],
  controllers: [
    CustomerTrackingController,
    CustomerDeliveriesController,
    PublicTrackingController,
    CustomerReceiptController,
  ],
  providers: [
    ReceiptPrismaReader,
    { provide: ReceiptReader, useExisting: ReceiptPrismaReader },
    ReceiptPdfService,
    ReceiptService,
    PublicParcelReaderAdapter,
    { provide: PublicParcelReader, useExisting: PublicParcelReaderAdapter },
    PublicTrackingRateLimitGuard,
    PublicTrackingService,
    ParcelsReaderAdapter,
    PrismaParcelStatusPolicy,
    { provide: CustomerParcelReader, useExisting: ParcelsReaderAdapter },
    { provide: ParcelStatusPolicy, useExisting: PrismaParcelStatusPolicy },
    TrackingService,
    DeliveryHistoryService,
  ],
})
export class TrackingModule {}
