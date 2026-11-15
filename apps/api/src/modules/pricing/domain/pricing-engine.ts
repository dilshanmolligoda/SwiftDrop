import { PackageSize } from '../../../generated/prisma/enums.js';
import type {
  FeeBreakdown,
  ZoneStrategy,
  WeightStrategy,
  SizeStrategy,
} from './pricing-strategy.interface.js';

export class DefaultZoneStrategy implements ZoneStrategy {
  calculate(deliveryAddress: string): {
    baseFee: number;
    estimatedDays: number;
    zoneCategory: 'LOCAL_COLOMBO' | 'WESTERN_PROVINCE' | 'ISLAND_WIDE';
  } {
    const isLocalColombo = /colombo\s*(0?[1-9]|1[0-5])\b/i.test(
      deliveryAddress,
    );
    const isWesternProvince =
      /(gampaha|kalutara|dehiwala|nugegoda|maharagama|moratuwa|kotte|battaramulla|kelaniya|wattala|negombo|panadura)/i.test(
        deliveryAddress,
      );

    if (isLocalColombo) {
      return { baseFee: 350, estimatedDays: 1, zoneCategory: 'LOCAL_COLOMBO' };
    }
    if (isWesternProvince) {
      return {
        baseFee: 450,
        estimatedDays: 1,
        zoneCategory: 'WESTERN_PROVINCE',
      };
    }
    return { baseFee: 650, estimatedDays: 2, zoneCategory: 'ISLAND_WIDE' };
  }
}

export class DefaultWeightStrategy implements WeightStrategy {
  calculate(weightKg: number): number {
    const extraKg = Math.max(0, Math.ceil(weightKg - 1.0));
    return extraKg * 100;
  }
}

export class DefaultSizeStrategy implements SizeStrategy {
  getMultiplier(size: PackageSize): number {
    switch (size) {
      case PackageSize.LARGE:
        return 1.5;
      case PackageSize.MEDIUM:
        return 1.2;
      case PackageSize.SMALL:
      default:
        return 1.0;
    }
  }
}

export class PricingEngine {
  constructor(
    private readonly zoneStrategy: ZoneStrategy = new DefaultZoneStrategy(),
    private readonly weightStrategy: WeightStrategy = new DefaultWeightStrategy(),
    private readonly sizeStrategy: SizeStrategy = new DefaultSizeStrategy(),
  ) {}

  calculate(
    deliveryAddress: string,
    weightKg: number,
    size: PackageSize,
  ): FeeBreakdown {
    const { baseFee, estimatedDays, zoneCategory } =
      this.zoneStrategy.calculate(deliveryAddress);
    const weightSurcharge = this.weightStrategy.calculate(weightKg);
    const sizeMultiplier = this.sizeStrategy.getMultiplier(size);

    const subtotal = baseFee + weightSurcharge;
    const totalCostLkr = Math.round(subtotal * sizeMultiplier);

    return {
      baseFee,
      weightSurcharge,
      sizeMultiplier,
      totalCostLkr,
      estimatedDays,
      zoneCategory,
    };
  }
}
