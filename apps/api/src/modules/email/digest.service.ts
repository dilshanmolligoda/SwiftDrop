import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { EmailService } from './email.service.js';
import {
  NotificationChannel,
  NotificationStatus,
  Role,
} from '../../generated/prisma/enums.js';

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async sendWeeklyDigestToUser(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });
    if (!user || !user.isActive || !user.email) return false;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const parcels = await this.prisma.parcel.findMany({
      where: {
        OR: [
          { customerId: user.id },
          { merchantOrder: { merchantUserId: user.id } },
        ],
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        id: true,
        status: true,
        costLkr: true,
      },
    });

    const completedCount = parcels.filter(
      (p) => p.status === 'DELIVERED',
    ).length;
    const inTransitCount = parcels.filter((p) =>
      ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PICKED_UP', 'ASSIGNED'].includes(
        p.status,
      ),
    ).length;
    const totalExpenses = parcels.reduce(
      (sum, p) => sum + (p.costLkr ? Number(p.costLkr) : 0),
      0,
    );

    const now = new Date();
    const period = `${sevenDaysAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    try {
      await this.emailService.sendWeeklyDeliveryDigestEmail(
        user.email,
        user.fullName,
        {
          completedCount,
          inTransitCount,
          totalExpenses,
          period,
        },
      );

      const eventId = randomUUID();
      await this.prisma.notification.create({
        data: {
          eventId,
          channel: NotificationChannel.EMAIL,
          recipientUserId: user.id,
          template: 'weekly_delivery_digest',
          title: 'Weekly delivery digest',
          description: `Weekly summary: ${completedCount} completed deliveries, ${inTransitCount} in-transit parcels, and expenses.`,
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });

      return true;
    } catch (err: unknown) {
      this.logger.error(
        `Failed to send weekly digest to ${user.email}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async sendWeeklyDigests(): Promise<{ sentCount: number }> {
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: [Role.CUSTOMER, Role.MERCHANT] },
        isActive: true,
      },
      select: { id: true },
    });

    let sentCount = 0;
    for (const user of users) {
      const sent = await this.sendWeeklyDigestToUser(user.id);
      if (sent) sentCount++;
    }

    return { sentCount };
  }
}
