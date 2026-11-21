import { Injectable } from '@nestjs/common';
import { PricingEngine } from './domain/pricing-engine.js';
import type { FeeBreakdown } from './domain/pricing-strategy.interface.js';
import type { EstimateFeeDto } from './dto/estimate-fee.dto.js';
import { PackageSize } from '../../generated/prisma/enums.js';

@Injectable()
export class PricingService {
  private readonly engine: PricingEngine;

  constructor() {
    this.engine = new PricingEngine();
  }

  estimate(dto: EstimateFeeDto): FeeBreakdown {
    return this.engine.calculate(
      dto.deliveryAddress,
      dto.weightKg,
      dto.packageSize,
    );
  }

  calculateFee(
    deliveryAddress: string,
    weightKg: number,
    size: PackageSize,
  ): FeeBreakdown {
    return this.engine.calculate(deliveryAddress, weightKg, size);
  }
}
