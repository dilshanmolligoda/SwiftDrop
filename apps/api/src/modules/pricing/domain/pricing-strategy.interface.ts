import { PackageSize } from '../../../generated/prisma/enums.js';

export interface FeeBreakdown {
  baseFee: number;
  weightSurcharge: number;
  sizeMultiplier: number;
  totalCostLkr: number;
  estimatedDays: number;
  zoneCategory: 'LOCAL_COLOMBO' | 'WESTERN_PROVINCE' | 'ISLAND_WIDE';
}

export interface ZoneStrategy {
  calculate(deliveryAddress: string): {
    baseFee: number;
    estimatedDays: number;
    zoneCategory: 'LOCAL_COLOMBO' | 'WESTERN_PROVINCE' | 'ISLAND_WIDE';
  };
}

export interface WeightStrategy {
  calculate(weightKg: number): number;
}

export interface SizeStrategy {
  getMultiplier(size: PackageSize): number;
}
