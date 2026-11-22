import {
  PricingEngine,
  DefaultZoneStrategy,
  DefaultWeightStrategy,
  DefaultSizeStrategy,
} from './pricing-engine.js';
import { PackageSize } from '../../../generated/prisma/enums.js';
import type {
  ZoneStrategy,
  WeightStrategy,
  SizeStrategy,
} from './pricing-strategy.interface.js';

describe('PricingEngine & Domain Strategies', () => {
  describe('DefaultZoneStrategy', () => {
    const zoneStrategy = new DefaultZoneStrategy();

    it('identifies Colombo postal codes as LOCAL_COLOMBO (350 LKR, 1 day)', () => {
      const result = zoneStrategy.calculate('142 Galle Road, Colombo 03');
      expect(result.zoneCategory).toBe('LOCAL_COLOMBO');
      expect(result.baseFee).toBe(350);
      expect(result.estimatedDays).toBe(1);
    });

    it('identifies Western province suburbs as WESTERN_PROVINCE (450 LKR, 1 day)', () => {
      const result = zoneStrategy.calculate('No 5, Kandy Road, Gampaha');
      expect(result.zoneCategory).toBe('WESTERN_PROVINCE');
      expect(result.baseFee).toBe(450);
      expect(result.estimatedDays).toBe(1);
    });

    it('defaults outstation addresses to ISLAND_WIDE (650 LKR, 2 days)', () => {
      const result = zoneStrategy.calculate('Peradeniya, Kandy');
      expect(result.zoneCategory).toBe('ISLAND_WIDE');
      expect(result.baseFee).toBe(650);
      expect(result.estimatedDays).toBe(2);
    });
  });

  describe('DefaultWeightStrategy', () => {
    const weightStrategy = new DefaultWeightStrategy();

    it('charges 0 surcharge for packages 1.0 kg or below', () => {
      expect(weightStrategy.calculate(0.5)).toBe(0);
      expect(weightStrategy.calculate(1.0)).toBe(0);
    });

    it('charges 100 LKR per extra kg (rounded up)', () => {
      expect(weightStrategy.calculate(1.1)).toBe(100);
      expect(weightStrategy.calculate(2.0)).toBe(100);
      expect(weightStrategy.calculate(2.5)).toBe(200);
      expect(weightStrategy.calculate(5.0)).toBe(400);
    });
  });

  describe('DefaultSizeStrategy', () => {
    const sizeStrategy = new DefaultSizeStrategy();

    it('returns correct multipliers: SMALL=1.0, MEDIUM=1.2, LARGE=1.5', () => {
      expect(sizeStrategy.getMultiplier(PackageSize.SMALL)).toBe(1.0);
      expect(sizeStrategy.getMultiplier(PackageSize.MEDIUM)).toBe(1.2);
      expect(sizeStrategy.getMultiplier(PackageSize.LARGE)).toBe(1.5);
    });
  });

  describe('PricingEngine (Composition and Strategy Injection)', () => {
    it('calculates total cost using injected default strategies', () => {
      const engine = new PricingEngine();

      // Colombo (350), 2.5 kg (+200 = 550), Medium (1.2x) => 660 LKR
      const breakdown = engine.calculate('Colombo 07', 2.5, PackageSize.MEDIUM);

      expect(breakdown.baseFee).toBe(350);
      expect(breakdown.weightSurcharge).toBe(200);
      expect(breakdown.sizeMultiplier).toBe(1.2);
      expect(breakdown.totalCostLkr).toBe(660);
      expect(breakdown.estimatedDays).toBe(1);
    });

    it('supports custom strategies (Open/Closed Principle)', () => {
      const customZone: ZoneStrategy = {
        calculate: () => ({
          baseFee: 500,
          estimatedDays: 3,
          zoneCategory: 'ISLAND_WIDE',
        }),
      };
      const customWeight: WeightStrategy = {
        calculate: () => 50,
      };
      const customSize: SizeStrategy = {
        getMultiplier: () => 2.0,
      };

      const customEngine = new PricingEngine(
        customZone,
        customWeight,
        customSize,
      );
      const breakdown = customEngine.calculate(
        'Anywhere',
        1.0,
        PackageSize.SMALL,
      );

      // (500 + 50) * 2.0 = 1100
      expect(breakdown.totalCostLkr).toBe(1100);
      expect(breakdown.baseFee).toBe(500);
      expect(breakdown.weightSurcharge).toBe(50);
      expect(breakdown.sizeMultiplier).toBe(2.0);
    });
  });
});
