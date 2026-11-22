import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import { EmailService } from '../email/email.service.js';
import { MerchantSettingsService } from './merchant-settings.service.js';

describe('MerchantSettingsService', () => {
  let service: MerchantSettingsService;
  let emailService: { sendMerchantApiKeyUpdatedEmail: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    merchantBusinessUpdateRequest: { create: jest.Mock; findMany: jest.Mock };
    merchantProfile: { findUnique: jest.Mock };
    notification: { createMany: jest.Mock };
  };

  beforeEach(async () => {
    emailService = {
      sendMerchantApiKeyUpdatedEmail: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      merchantBusinessUpdateRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      merchantProfile: {
        findUnique: jest.fn(),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantSettingsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PasswordService,
          useValue: { hash: jest.fn(), verify: jest.fn() },
        },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<MerchantSettingsService>(MerchantSettingsService);
  });

  describe('notifyApiKeyUpdated (Scenario 27)', () => {
    const merchantUser = {
      id: 'merchant-user-id',
      email: 'merchant@example.com',
      fullName: 'Merchant Partner',
      role: 'MERCHANT',
    };

    it('sends email and creates notifications when an API key is issued', async () => {
      prisma.user.findUnique.mockResolvedValue(merchantUser);

      const result = await service.notifyApiKeyUpdated(
        'merchant-user-id',
        'issued',
        'sd_live_abc123',
      );

      expect(result).toEqual({
        message: 'API key notification processed',
        action: 'issued',
        keyPrefix: 'sd_live_abc123',
      });

      expect(emailService.sendMerchantApiKeyUpdatedEmail).toHaveBeenCalledWith(
        'merchant@example.com',
        'Merchant Partner',
        'issued',
        'sd_live_abc123',
      );

      const createManyCalls = prisma.notification.createMany.mock
        .calls as unknown as Array<
        [{ data: Array<{ channel: string; template: string; title: string }> }]
      >;
      expect(createManyCalls.length).toBeGreaterThan(0);
      const callData = createManyCalls[0]?.[0]?.data ?? [];
      expect(callData).toHaveLength(2);
      expect(callData[0]?.channel).toBe('EMAIL');
      expect(callData[0]?.template).toBe('merchant_api_key_updated');
      expect(callData[1]?.channel).toBe('IN_APP');
      expect(callData[1]?.template).toBe('merchant_api_key_updated');
    });

    it('sends email and creates notifications when an API key is revoked', async () => {
      prisma.user.findUnique.mockResolvedValue(merchantUser);

      const result = await service.notifyApiKeyUpdated(
        'merchant-user-id',
        'revoked',
        'sd_live_xyz789',
      );

      expect(result.action).toBe('revoked');
      expect(emailService.sendMerchantApiKeyUpdatedEmail).toHaveBeenCalledWith(
        'merchant@example.com',
        'Merchant Partner',
        'revoked',
        'sd_live_xyz789',
      );
      expect(prisma.notification.createMany).toHaveBeenCalled();
    });

    it('throws NotFoundException if merchant does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.notifyApiKeyUpdated(
          'non-existent-user',
          'issued',
          'sd_prefix_123',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
