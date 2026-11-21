import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { Role } from '../../generated/prisma/enums.js';
import type { Request } from 'express';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    changePassword: jest.Mock;
    updateProfile: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      changePassword: jest.fn(),
      updateProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('delegates changePassword to UsersService with user id, dto, and user-agent', async () => {
    const user = {
      id: 'user-id-123',
      email: 'user@example.com',
      role: Role.CUSTOMER,
    };
    const dto = {
      currentPassword: 'current-pass-123',
      newPassword: 'new-pass-45678',
    };
    const req = {
      headers: {
        'user-agent': 'Chrome-Test-Agent',
      },
    } as unknown as Request;

    const expectedResult = {
      message: 'Your password was successfully updated',
    };
    usersService.changePassword.mockResolvedValue(expectedResult);

    const result = await controller.changePassword(user, dto, req);

    expect(usersService.changePassword).toHaveBeenCalledWith(
      'user-id-123',
      dto,
      'Chrome-Test-Agent',
    );
    expect(result).toEqual(expectedResult);
  });

  it('delegates updateProfile to UsersService with user id and dto', async () => {
    const user = {
      id: 'user-id-123',
      email: 'user@example.com',
      role: Role.CUSTOMER,
    };
    const dto = {
      fullName: 'Updated Name',
      phoneNumber: '+94779998877',
    };
    const expectedResult = {
      message: 'Profile updated successfully',
      user: { id: 'user-id-123', email: 'user@example.com', fullName: 'Updated Name', phoneNumber: '+94779998877' } as any,
    };
    usersService.updateProfile.mockResolvedValue(expectedResult);

    const result = await controller.updateProfile(user, dto);

    expect(usersService.updateProfile).toHaveBeenCalledWith('user-id-123', dto);
    expect(result).toEqual(expectedResult);
  });
});
