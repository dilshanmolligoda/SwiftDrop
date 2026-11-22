/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ParcelsService } from './parcels.service.js';
import { ParcelsRepository } from './parcels.repository.js';
import { PricingService } from '../pricing/pricing.service.js';
import {
  PackageSize,
  ParcelStatus,
  Role,
} from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

describe('ParcelsService', () => {
  let service: ParcelsService;
  let repository: jest.Mocked<ParcelsRepository>;
  let pricingService: jest.Mocked<PricingService>;

  const mockUser: AuthenticatedUser = {
    id: 'user-uuid-1',
    email: 'customer@swiftdrop.local',
    role: Role.CUSTOMER,
  };

  beforeEach(async () => {
    const mockRepository = {
      createParcel: jest.fn(),
      findCustomerParcels: jest.fn(),
      findCustomerTrackingParcels: jest.fn(),
      findCustomerParcelById: jest.fn(),
      getCustomerMetrics: jest.fn(),
      cancelParcel: jest.fn(),
    };

    const mockPricingService = {
      estimate: jest.fn(),
      calculateFee: jest.fn().mockReturnValue({
        baseFee: 350,
        weightSurcharge: 0,
        sizeMultiplier: 1.0,
        totalCostLkr: 350,
        estimatedDays: 1,
        zoneCategory: 'LOCAL_COLOMBO',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParcelsService,
        { provide: ParcelsRepository, useValue: mockRepository },
        { provide: PricingService, useValue: mockPricingService },
      ],
    }).compile();

    service = module.get<ParcelsService>(ParcelsService);
    repository = module.get(ParcelsRepository);
    pricingService = module.get(PricingService);
  });

  describe('create', () => {
    it('calculates price and creates a parcel with a generated tracking number', async () => {
      const mockCreated = {
        id: 'parcel-123',
        trackingNumber: 'SD-12345',
        customerId: mockUser.id,
        senderName: 'Jane Doe',
        senderAddress: 'Colombo 03',
        recipientName: 'Sunil Perera',
        recipientAddress: 'Peradeniya Road, Kandy',
        recipientPhone: '+94 77 123 4567',
        packageSize: PackageSize.SMALL,
        weightKg: 1.0,
        costLkr: 350,
        status: ParcelStatus.PENDING,
        failureReason: null,
        failedDeliveryAttempts: 0,
        deliveredAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.createParcel.mockResolvedValue(mockCreated);

      const result = await service.create(mockUser, {
        senderAddress: 'Colombo 03',
        recipientName: 'Sunil Perera',
        recipientAddress: 'Peradeniya Road, Kandy',
        recipientPhone: '+94 77 123 4567',
        packageSize: PackageSize.SMALL,
        weightKg: 1.0,
      });

      expect(pricingService.calculateFee).toHaveBeenCalledWith(
        'Peradeniya Road, Kandy',
        1.0,
        PackageSize.SMALL,
      );
      expect(repository.createParcel).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: mockUser.id,
          senderName: mockUser.email,
          costLkr: 350,
          trackingNumber: expect.stringMatching(/^SD-[A-F0-9]{32}$/),
        }),
      );
      expect(result).toEqual(mockCreated);
    });
  });

  describe('listForCustomer', () => {
    it('returns parcels belonging to the customer', async () => {
      const mockParcels = [
        {
          id: 'p-1',
          trackingNumber: 'SD-24819',
          customerId: mockUser.id,
          senderName: 'Jane Doe',
          senderAddress: 'Colombo 03',
          recipientName: 'Sunil Perera',
          recipientAddress: 'Peradeniya Road, Kandy',
          recipientPhone: '+94 77 123 4567',
          packageSize: PackageSize.MEDIUM,
          weightKg: 2.5,
          costLkr: 650,
          status: ParcelStatus.IN_TRANSIT,
          failureReason: null,
          failedDeliveryAttempts: 0,
          deliveredAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      repository.findCustomerParcels.mockResolvedValue(mockParcels);

      const result = await service.listForCustomer(mockUser.id);
      expect(repository.findCustomerParcels).toHaveBeenCalledWith(mockUser.id);
      expect(result).toHaveLength(1);
      expect(result[0].trackingNumber).toBe('SD-24819');
    });
  });

  it('delegates the tracking snapshot to a separate customer-scoped read contract', async () => {
    repository.findCustomerTrackingParcels.mockResolvedValue([]);
    await expect(service.listForCustomerTracking(mockUser.id)).resolves.toEqual(
      [],
    );
    expect(repository.findCustomerTrackingParcels).toHaveBeenCalledWith(
      mockUser.id,
    );
    expect(repository.findCustomerParcels).not.toHaveBeenCalled();
  });

  describe('getMetrics', () => {
    it('returns activeDeliveries, deliveredThisMonth, and needsAttention', async () => {
      repository.getCustomerMetrics.mockResolvedValue({
        activeDeliveries: 3,
        deliveredThisMonth: 12,
        needsAttention: 1,
      });

      const metrics = await service.getMetrics(mockUser.id);
      expect(metrics).toEqual({
        activeDeliveries: 3,
        deliveredThisMonth: 12,
        needsAttention: 1,
      });
    });
  });

  describe('getById', () => {
    it('returns the parcel if found and owned by the customer', async () => {
      const mockParcel = {
        id: 'parcel-1',
        trackingNumber: 'SD-24819',
        customerId: mockUser.id,
        senderName: 'Jane Doe',
        senderAddress: 'Colombo 03',
        recipientName: 'Sunil Perera',
        recipientAddress: 'Peradeniya Road, Kandy',
        recipientPhone: '+94 77 123 4567',
        packageSize: PackageSize.MEDIUM,
        weightKg: 2.5,
        costLkr: 650,
        status: ParcelStatus.IN_TRANSIT,
        failureReason: null,
        failedDeliveryAttempts: 0,
        deliveredAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.findCustomerParcelById.mockResolvedValue(mockParcel);

      const result = await service.getById(mockUser.id, 'parcel-1');
      expect(result.id).toBe('parcel-1');
    });

    it('throws NotFoundException if parcel does not exist', async () => {
      repository.findCustomerParcelById.mockResolvedValue(null);

      await expect(
        service.getById(mockUser.id, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('cancels delivery when status is PENDING and returns cancelled parcel', async () => {
      const mockParcel = {
        id: 'parcel-1',
        customerId: mockUser.id,
        trackingNumber: 'SD-CANCEL123',
        senderName: 'Sender',
        senderAddress: 'Address 1',
        recipientName: 'Recipient',
        recipientAddress: 'Address 2',
        recipientPhone: '+94770000000',
        packageSize: PackageSize.SMALL,
        weightKg: 1.0,
        costLkr: 350,
        status: ParcelStatus.PENDING,
        failureReason: null,
        failedDeliveryAttempts: 0,
        deliveredAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      repository.findCustomerParcelById.mockResolvedValue(mockParcel);
      repository.cancelParcel.mockResolvedValue({
        ...mockParcel,
        status: ParcelStatus.RETURNED,
      });

      const result = await service.cancel(mockUser.id, 'parcel-1');
      expect(result.status).toBe(ParcelStatus.RETURNED);
      expect(repository.cancelParcel).toHaveBeenCalledWith(
        mockUser.id,
        'parcel-1',
      );
    });

    it('throws ConflictException if parcel has already been picked up', async () => {
      const mockParcel = {
        id: 'parcel-1',
        customerId: mockUser.id,
        trackingNumber: 'SD-CANCEL123',
        senderName: 'Sender',
        senderAddress: 'Address 1',
        recipientName: 'Recipient',
        recipientAddress: 'Address 2',
        recipientPhone: '+94770000000',
        packageSize: PackageSize.SMALL,
        weightKg: 1.0,
        costLkr: 350,
        status: ParcelStatus.PICKED_UP,
        failureReason: null,
        failedDeliveryAttempts: 0,
        deliveredAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      repository.findCustomerParcelById.mockResolvedValue(mockParcel);

      await expect(service.cancel(mockUser.id, 'parcel-1')).rejects.toThrow(
        /Cannot cancel delivery with status PICKED_UP/,
      );
    });
  });
});
