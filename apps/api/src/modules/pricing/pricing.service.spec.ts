import { PricingService } from './pricing.service.js';
import { PackageSize } from '../../generated/prisma/enums.js';

describe('PricingService', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
  });

  describe('calculateFee', () => {
    it('calculates standard rate for Local Colombo under 1 kg', () => {
      const result = service.calculateFee(
        'No 12, Galle Road, Colombo 03',
        0.8,
        PackageSize.SMALL,
      );

      expect(result.zoneCategory).toBe('LOCAL_COLOMBO');
      expect(result.baseFee).toBe(350);
      expect(result.weightSurcharge).toBe(0);
      expect(result.sizeMultiplier).toBe(1.0);
      expect(result.totalCostLkr).toBe(350);
      expect(result.estimatedDays).toBe(1);
    });

    it('applies weight surcharge and medium size multiplier for Colombo', () => {
      // 2.5 kg -> 2 extra kg -> +200 surcharge. Base 350 + 200 = 550. Medium size = 1.2x -> 660 LKR
      const result = service.calculateFee(
        'Colombo 07, Cinnamon Gardens',
        2.5,
        PackageSize.MEDIUM,
      );

      expect(result.baseFee).toBe(350);
      expect(result.weightSurcharge).toBe(200);
      expect(result.sizeMultiplier).toBe(1.2);
      expect(result.totalCostLkr).toBe(660);
    });

    it('calculates Western Province suburbs rate correctly', () => {
      const result = service.calculateFee(
        'Main Street, Gampaha',
        1.0,
        PackageSize.SMALL,
      );

      expect(result.zoneCategory).toBe('WESTERN_PROVINCE');
      expect(result.baseFee).toBe(450);
      expect(result.totalCostLkr).toBe(450);
      expect(result.estimatedDays).toBe(1);
    });

    it('calculates Island-wide express rate for outstation destination', () => {
      // 3.0 kg -> 2 extra kg -> +200 surcharge. Base 650 + 200 = 850. Large size = 1.5x -> 1275 LKR
      const result = service.calculateFee(
        'Peradeniya Road, Kandy',
        3.0,
        PackageSize.LARGE,
      );

      expect(result.zoneCategory).toBe('ISLAND_WIDE');
      expect(result.baseFee).toBe(650);
      expect(result.weightSurcharge).toBe(200);
      expect(result.sizeMultiplier).toBe(1.5);
      expect(result.totalCostLkr).toBe(1275);
      expect(result.estimatedDays).toBe(2);
    });
  });

  describe('estimate', () => {
    it('returns fee breakdown from EstimateFeeDto', () => {
      const result = service.estimate({
        pickupAddress: 'Colombo 03',
        deliveryAddress: 'Beach Road, Matara',
        weightKg: 1.5,
        packageSize: PackageSize.SMALL,
      });

      expect(result.totalCostLkr).toBeGreaterThan(650);
      expect(result.estimatedDays).toBe(2);
    });
  });
});
