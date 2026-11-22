/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';
import { PackageSize } from '../../generated/prisma/enums.js';

import { EstimateFeeDto } from './dto/estimate-fee.dto.js';

describe('PricingController', () => {
  let controller: PricingController;
  let service: jest.Mocked<PricingService>;

  beforeEach(async () => {
    const mockPricingService = {
      estimate: jest.fn(),
      calculateFee: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PricingController],
      providers: [
        {
          provide: PricingService,
          useValue: mockPricingService,
        },
      ],
    }).compile();

    controller = module.get<PricingController>(PricingController);
    service = module.get(PricingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('estimateFee', () => {
    it('should delegate fee calculation to pricingService with correct parameters', () => {
      const mockResult = {
        totalCostLkr: 660,
        baseFee: 350,
        weightSurcharge: 200,
        sizeMultiplier: 1.2,
        estimatedDays: 1,
        zoneCategory: 'LOCAL_COLOMBO' as const,
      };
      service.estimate.mockReturnValue(mockResult);

      const dto: EstimateFeeDto = {
        pickupAddress: '142, Galle Road, Colombo 03',
        deliveryAddress: 'Kadawatha, Kandy Road',
        weightKg: 2.5,
        packageSize: PackageSize.MEDIUM,
      };

      const result = controller.estimateFee(dto);

      expect(service.estimate).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockResult);
    });
  });
});
