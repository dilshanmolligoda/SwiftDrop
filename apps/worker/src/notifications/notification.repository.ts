import { Injectable } from '@nestjs/common';
import type {
  NotificationChannel,
  NotificationStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import type { Recipient } from './notification-channel.js';

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The account that booked the parcel, or null if it no longer exists. */
  async findRecipient(parcelId: string): Promise<Recipient | null> {
    const parcel = await this.prisma.parcel.findUnique({
      where: { id: parcelId },
      select: {
        customer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phoneNumber: true,
            isActive: true,
          },
        },
      },
    });
    const customer = parcel?.customer;
    if (!customer || !customer.isActive) return null;
    return {
      userId: customer.id,
      fullName: customer.fullName,
      email: customer.email || null,
      phoneNumber: customer.phoneNumber || null,
    };
  }

  /** Fetches parcel details including recipient contacts and sender name */
  async findParcel(parcelId: string) {
    return this.prisma.parcel.findUnique({
      where: { id: parcelId },
      select: {
        id: true,
        trackingNumber: true,
        customerId: true,
        senderName: true,
        recipientName: true,
        recipientPhone: true,
        recipientAddress: true,
      },
    });
  }

  /** Finds an active user by phone number */
  async findUserByPhone(phoneNumber: string): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({
      where: { phoneNumber, isActive: true },
      select: { id: true },
    });
  }

  /** True when this channel already has a result for the event. */
  async alreadyHandled(
    eventId: string,
    channel: NotificationChannel,
    recipientUserId: string,
  ): Promise<boolean> {
    const row = await this.prisma.notification.findUnique({
      where: {
        eventId_channel_recipientUserId: { eventId, channel, recipientUserId },
      },
      select: { id: true },
    });
    return row !== null;
  }

  /** Idempotent: a second record for the same key is ignored. */
  async record(entry: {
    eventId: string;
    channel: NotificationChannel;
    recipientUserId: string;
    template: string;
    title?: string;
    description?: string;
    status: NotificationStatus;
    errorMessage: string | null;
  }): Promise<void> {
    await this.prisma.notification.createMany({
      data: [
        {
          ...entry,
          errorMessage: entry.errorMessage?.slice(0, 500) ?? null,
          sentAt: entry.status === 'SENT' ? new Date() : null,
        },
      ],
      skipDuplicates: true,
    });
  }
}
