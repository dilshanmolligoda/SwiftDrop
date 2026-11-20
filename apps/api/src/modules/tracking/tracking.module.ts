import { Module } from '@nestjs/common';
import { ParcelsModule } from '../parcels/parcels.module.js';
import { ParcelsReaderAdapter } from './adapters/parcels-reader.adapter.js';
import { CustomerDeliveriesController } from './controllers/customer-deliveries.controller.js';
import { CustomerTrackingController } from './controllers/customer-tracking.controller.js';
import { PrismaParcelStatusPolicy } from './domain/prisma-parcel-status.policy.js';
import { CustomerParcelReader } from './ports/parcel-reader.port.js';
import { ParcelStatusPolicy } from './ports/parcel-status-policy.port.js';
import { DeliveryHistoryService } from './services/delivery-history.service.js';
import { TrackingService } from './services/tracking.service.js';

@Module({
  imports: [ParcelsModule],
  controllers: [CustomerTrackingController, CustomerDeliveriesController],
  providers: [
    ParcelsReaderAdapter,
    PrismaParcelStatusPolicy,
    { provide: CustomerParcelReader, useExisting: ParcelsReaderAdapter },
    { provide: ParcelStatusPolicy, useExisting: PrismaParcelStatusPolicy },
    TrackingService,
    DeliveryHistoryService,
  ],
})
export class TrackingModule {}
