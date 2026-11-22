/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ParcelsController } from './parcels.controller.js';
import { ParcelsService } from './parcels.service.js';
import {
  PackageSize,
  ParcelStatus,
  Role,
} from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type {
  CustomerParcelRecord,
  CustomerMetrics,
} from './parcels.repository.js';
import type { CreateParcelDto } from './dto/create-parcel.dto.js';

describe('ParcelsController', () => {
  let controller: ParcelsController;
  let service: jest.Mocked<ParcelsService>;

  const mockUser: AuthenticatedUser = {
    id: 'user-uuid-1',
    email: 'customer@swiftdrop.local',
    role: Role.CUSTOMER,
  };

  const mockParcelRecord: CustomerParcelRecord = {
    id: 'parcel-uuid-1',
    trackingNumber: 'SD-123456',
    senderName: 'Nimradha',
    senderAddress: '142, Colombo',
    recipientName: 'Kasun Perera',
    recipientAddress: '24, Kandy Road, Kadawatha',
    recipientPhone: '0712345678',
    packageSize: PackageSize.MEDIUM,
    weightKg: 1.5,
    costLkr: 550,
    status: ParcelStatus.CREATED,
    createdAt: new Date().toISOString(),
    statusHistory: [],
  };

  beforeEach(async () => {
    const mockParcelsService = {
      create: jest.fn(),
      listForCustomer: jest.fn(),
      getMetrics: jest.fn(),
      getById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParcelsController],
      providers: [
        {
          provide: ParcelsService,
          useValue: mockParcelsService,
        },
      ],
    }).compile();

    controller = module.get<ParcelsController>(ParcelsController);
    service = module.get(ParcelsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createDelivery', () => {
    it('should create a delivery parcel for authenticated customer', async () => {
      service.create.mockResolvedValue(mockParcelRecord);

      const dto: CreateParcelDto = {
        recipientName: 'Kasun Perera',
        recipientAddress: '24, Kandy Road, Kadawatha',
        recipientPhone: '0712345678',
        senderAddress: '142, Colombo',
        packageSize: PackageSize.MEDIUM,
        weightKg: 1.5,
      };

      const result = await controller.createDelivery(mockUser, dto);

      expect(service.create).toHaveBeenCalledWith(mockUser, dto);
      expect(result).toEqual(mockParcelRecord);
    });
  });

  describe('getMyDeliveries', () => {
    it('should list all deliveries for current customer', async () => {
      service.listForCustomer.mockResolvedValue([mockParcelRecord]);

      const result = await controller.getMyDeliveries(mockUser);

      expect(service.listForCustomer).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual([mockParcelRecord]);
    });
  });

  describe('getDashboardMetrics', () => {
    it('should return aggregated metrics for current customer', async () => {
      const mockMetrics: CustomerMetrics = {
        activeDeliveries: 1,
        deliveredThisMonth: 0,
        needsAttention: 0,
      };
      service.getMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.getDashboardMetrics(mockUser);

      expect(service.getMetrics).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(mockMetrics);
    });
  });

  describe('getParcelDetails', () => {
    it('should return details of a single parcel by ID', async () => {
      service.getById.mockResolvedValue(mockParcelRecord);

      const result = await controller.getParcelDetails(
        mockUser,
        'parcel-uuid-1',
      );

      expect(service.getById).toHaveBeenCalledWith(
        mockUser.id,
        'parcel-uuid-1',
      );
      expect(result).toEqual(mockParcelRecord);
    });
  });
});
