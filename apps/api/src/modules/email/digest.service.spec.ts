import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { EmailService } from './email.service.js';
import { DigestService } from './digest.service.js';
import { Role } from '../../generated/prisma/enums.js';

describe('DigestService (Scenario 32)', () => {
  let service: DigestService;
  let emailService: { sendWeeklyDeliveryDigestEmail: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    parcel: { findMany: jest.Mock };
    notification: { create: jest.Mock };
  };

  beforeEach(async () => {
    emailService = {
      sendWeeklyDeliveryDigestEmail: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      parcel: {
        findMany: jest.fn(),
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notif-id' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<DigestService>(DigestService);
  });

  describe('sendWeeklyDigestToUser', () => {
    const user = {
      id: 'customer-1',
      email: 'customer@example.com',
      fullName: 'Kasun Silva',
      role: Role.CUSTOMER,
      isActive: true,
    };

    it('calculates metrics, dispatches digest email and logs notification', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.parcel.findMany.mockResolvedValue([
        { id: 'p1', status: 'DELIVERED', costLkr: 500 },
        { id: 'p2', status: 'IN_TRANSIT', costLkr: 750 },
        { id: 'p3', status: 'OUT_FOR_DELIVERY', costLkr: 250 },
      ]);

      const result = await service.sendWeeklyDigestToUser('customer-1');
      expect(result).toBe(true);

      expect(emailService.sendWeeklyDeliveryDigestEmail).toHaveBeenCalledWith(
        'customer@example.com',
        'Kasun Silva',
        expect.objectContaining({
          completedCount: 1,
          inTransitCount: 2,
          totalExpenses: 1500,
        }),
      );

      const notifCall = prisma.notification.create.mock.calls as Array<
        [
          {
            data: {
              channel: string;
              recipientUserId: string;
              template: string;
            };
          },
        ]
      >;
      expect(notifCall.length).toBe(1);
      expect(notifCall[0][0].data.recipientUserId).toBe('customer-1');
      expect(notifCall[0][0].data.template).toBe('weekly_delivery_digest');
    });

    it('returns false if user is inactive or has no email', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        isActive: false,
      });

      const result = await service.sendWeeklyDigestToUser('customer-1');
      expect(result).toBe(false);
      expect(emailService.sendWeeklyDeliveryDigestEmail).not.toHaveBeenCalled();
    });
  });

  describe('sendWeeklyDigests', () => {
    it('dispatches digests to all active customers and merchants', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ]);
      const spy = jest
        .spyOn(service, 'sendWeeklyDigestToUser')
        .mockResolvedValue(true);

      const result = await service.sendWeeklyDigests();
      expect(result.sentCount).toBe(2);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
