import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { Role, ApprovalStatus } from '../../generated/prisma/enums.js';
import type { LoginResponse, UserProfile } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock; getProfile: jest.Mock };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      getProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('delegates login to AuthService.login', async () => {
    const loginResponse: LoginResponse = {
      accessToken: 'sample-jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        fullName: 'Test User',
        role: Role.CUSTOMER,
      },
    };
    authService.login.mockResolvedValue(loginResponse);

    const dto = { email: 'user@example.com', password: 'password123' };
    const result = await controller.login(dto);

    expect(authService.login).toHaveBeenCalledWith(dto);
    expect(result).toEqual(loginResponse);
  });

  it('delegates getProfile to AuthService.getProfile using authenticated user id', async () => {
    const profileResponse: UserProfile = {
      id: 'user-1',
      email: 'user@example.com',
      fullName: 'Test User',
      role: Role.CUSTOMER,
      approvalStatus: ApprovalStatus.APPROVED,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    authService.getProfile.mockResolvedValue(profileResponse);

    const currentUser = {
      id: 'user-1',
      email: 'user@example.com',
      role: Role.CUSTOMER,
    };
    const result = await controller.getProfile(currentUser);

    expect(authService.getProfile).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(profileResponse);
  });
});
