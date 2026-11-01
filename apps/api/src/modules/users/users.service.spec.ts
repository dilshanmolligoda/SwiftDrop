import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service.js';
import { UsersRepository } from './repositories/users.repository.js';
import { Role, ApprovalStatus } from '../../generated/prisma/enums.js';
import type { User } from '../../generated/prisma/client.js';

describe('UsersService', () => {
  let service: UsersService;
  let repository: { findByEmail: jest.Mock; findById: jest.Mock };

  const mockUser: User = {
    id: 'user-uuid-1',
    email: 'user@example.com',
    fullName: 'Jane Doe',
    passwordHash: '$2b$12$hashedPassword',
    role: Role.CUSTOMER,
    approvalStatus: ApprovalStatus.APPROVED,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
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
    it('delegates to repository with provided id', async () => {
      repository.findById.mockResolvedValue(mockUser);

      const result = await service.findById('user-uuid-1');
      expect(repository.findById).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual(mockUser);
    });

    it('returns null if id is empty or null', async () => {
      const result = await service.findById('');
      expect(result).toBeNull();
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });
});
