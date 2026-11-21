import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service.js';
import { UsersRepository } from './repositories/users.repository.js';
import {
  Role,
  ApprovalStatus,
  VehicleType,
} from '../../generated/prisma/enums.js';
import type { User } from '../../generated/prisma/client.js';

describe('UsersService', () => {
  let service: UsersService;
  let repository: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    createCustomer: jest.Mock;
    createMerchant: jest.Mock;
    createCourier: jest.Mock;
  };

  const mockUser: User = {
    id: 'user-uuid-1',
    email: 'user@example.com',
    fullName: 'Jane Doe',
    phoneNumber: '+94771234567',
    passwordHash: '$2b$12$hashedPassword',
    role: Role.CUSTOMER,
    approvalStatus: ApprovalStatus.APPROVED,
    isActive: true,
    googleSubject: null,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      createCustomer: jest.fn(),
      createMerchant: jest.fn(),
      createCourier: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findByEmail', () => {
    it('delegates to repository with provided email', async () => {
      repository.findByEmail.mockResolvedValue(mockUser);

      const result = await service.findByEmail('user@example.com');
      expect(repository.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(result).toEqual(mockUser);
    });

    it('returns null if email is empty or null', async () => {
      const result = await service.findByEmail('');
      expect(result).toBeNull();
      expect(repository.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('delegates to repository with provided ID', async () => {
      repository.findById.mockResolvedValue(mockUser);

      const result = await service.findById('user-uuid-1');
      expect(repository.findById).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual(mockUser);
    });

    it('returns null if ID is empty or null', async () => {
      const result = await service.findById('');
      expect(result).toBeNull();
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  describe('createCustomer', () => {
    it('delegates customer creation to repository', async () => {
      repository.createCustomer.mockResolvedValue(mockUser);

      const data = {
        email: 'user@example.com',
        fullName: 'Jane Doe',
        phoneNumber: '+94771234567',
        passwordHash: '$2b$12$hashedPassword',
      };

      const result = await service.createCustomer(data);
      expect(repository.createCustomer).toHaveBeenCalledWith(data);
      expect(result).toEqual(mockUser);
    });
  });

  describe('createMerchant', () => {
    it('delegates merchant creation to repository', async () => {
      const merchantWithProfile = {
        ...mockUser,
        role: Role.MERCHANT,
        approvalStatus: ApprovalStatus.PENDING,
        merchantProfile: {
          id: 'profile-1',
          userId: mockUser.id,
          businessName: 'My Store',
          businessAddress: '123 Main St',
          businessType: 'Retail',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      repository.createMerchant.mockResolvedValue(merchantWithProfile);

      const data = {
        email: 'merchant@example.com',
        fullName: 'Jane Doe',
        phoneNumber: '+94771234567',
        passwordHash: '$2b$12$hashedPassword',
        businessName: 'My Store',
        businessAddress: '123 Main St',
        businessType: 'Retail',
      };

      const result = await service.createMerchant(data);
      expect(repository.createMerchant).toHaveBeenCalledWith(data);
      expect(result).toEqual(merchantWithProfile);
    });
  });

  describe('createCourier', () => {
    it('delegates courier creation to repository', async () => {
      const courierWithProfile = {
        ...mockUser,
        role: Role.COURIER,
        approvalStatus: ApprovalStatus.PENDING,
        courierProfile: {
          id: 'profile-2',
          userId: mockUser.id,
          vehicleType: VehicleType.MOTORCYCLE,
          licensePlate: 'WP-ABC-1234',
          licenseNumber: 'B1234567',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      repository.createCourier.mockResolvedValue(courierWithProfile);

      const data = {
        email: 'courier@example.com',
        fullName: 'Jane Doe',
        phoneNumber: '+94771234567',
        passwordHash: '$2b$12$hashedPassword',
        vehicleType: VehicleType.MOTORCYCLE,
        licensePlate: 'WP-ABC-1234',
        licenseNumber: 'B1234567',
      };

      const result = await service.createCourier(data);
      expect(repository.createCourier).toHaveBeenCalledWith(data);
      expect(result).toEqual(courierWithProfile);
    });
  });
});
