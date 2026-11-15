import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ParcelsRepository,
  type CustomerParcelRecord,
  type CustomerMetrics,
} from './parcels.repository.js';
import { PricingService } from '../pricing/pricing.service.js';
import type { CreateParcelDto } from './dto/create-parcel.dto.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Injectable()
export class ParcelsService {
  constructor(
    private readonly parcelsRepository: ParcelsRepository,
    private readonly pricingService: PricingService,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateParcelDto,
  ): Promise<CustomerParcelRecord> {
    const feeCalculation = this.pricingService.calculateFee(
      dto.recipientAddress,
      dto.weightKg,
      dto.packageSize,
    );

    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const trackingNumber = `SD-${randomSuffix}`;

    return this.parcelsRepository.createParcel({
      trackingNumber,
      customerId: user.id,
      senderName: user.email,
      senderAddress: dto.senderAddress,
      recipientName: dto.recipientName,
      recipientAddress: dto.recipientAddress,
      recipientPhone: dto.recipientPhone,
      packageSize: dto.packageSize,
      weightKg: dto.weightKg,
      costLkr: feeCalculation.totalCostLkr,
      note: dto.notes,
    });
  }

  listForCustomer(customerId: string): Promise<CustomerParcelRecord[]> {
    return this.parcelsRepository.findCustomerParcels(customerId);
  }

  getMetrics(customerId: string): Promise<CustomerMetrics> {
    return this.parcelsRepository.getCustomerMetrics(customerId);
  }

  async getById(
    customerId: string,
    parcelId: string,
  ): Promise<CustomerParcelRecord> {
    const parcel = await this.parcelsRepository.findCustomerParcelById(
      customerId,
      parcelId,
    );
    if (!parcel) {
      throw new NotFoundException('Parcel not found');
    }
    return parcel;
  }
}
