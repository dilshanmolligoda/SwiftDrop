import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OutboxWriter } from '../../infrastructure/outbox/outbox.writer.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  ParcelStatus,
  PackageSize,
  NotificationChannel,
  NotificationStatus,
} from '../../generated/prisma/enums.js';

export interface CustomerParcelRecord {
  id: string;
  trackingNumber: string;
  customerId: string;
  senderName: string;
  senderAddress: string;
  recipientName: string;
  recipientAddress: string;
  recipientPhone: string;
  packageSize: PackageSize;
  weightKg: number;
  costLkr: number;
  status: ParcelStatus;
  failureReason: string | null;
  failedDeliveryAttempts: number;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  statusHistory?: Array<{
    id: string;
    status: ParcelStatus;
    location: string | null;
    note: string | null;
    createdAt: Date;
  }>;
}

export interface CustomerMetrics {
  activeDeliveries: number;
  deliveredThisMonth: number;
  needsAttention: number;
}

interface TxWithNotification {
  notification?: {
    create: (args: {
      data: {
        eventId: string;
        channel: NotificationChannel;
        recipientUserId: string;
        template: string;
        title: string;
        description: string;
        status: NotificationStatus;
        sentAt: Date;
      };
    }) => Promise<unknown>;
  };
}

@Injectable()
export class ParcelsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
  ) {}

  async createParcel(data: {
    trackingNumber: string;
    customerId: string;
    senderName: string;
    senderAddress: string;
    recipientName: string;
    recipientAddress: string;
    recipientPhone: string;
    packageSize: PackageSize;
    weightKg: number;
    costLkr: number;
    note?: string;
  }): Promise<CustomerParcelRecord> {
    // Same transaction: the parcel.created event exists only if the parcel does.
    const parcel = await this.prisma.$transaction(async (tx) => {
      const created = await tx.parcel.create({
        data: {
          trackingNumber: data.trackingNumber,
          customerId: data.customerId,
          senderName: data.senderName,
          senderAddress: data.senderAddress,
          recipientName: data.recipientName,
          recipientAddress: data.recipientAddress,
          recipientPhone: data.recipientPhone,
          packageSize: data.packageSize,
          weightKg: data.weightKg,
          costLkr: data.costLkr,
          status: ParcelStatus.PENDING,
          statusHistory: {
            create: {
              status: ParcelStatus.PENDING,
              note: data.note ?? 'Delivery request created by customer.',
            },
          },
        },
        include: {
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      await this.outbox.recordParcelCreated(tx, {
        parcel: created,
        status: ParcelStatus.PENDING,
      });

      const txNotif = tx as unknown as TxWithNotification;
      if (txNotif.notification) {
        await txNotif.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: data.customerId,
            template: 'parcel_created',
            title: 'Delivery created',
            description: `Your delivery request ${data.trackingNumber} has been confirmed.`,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      }

      return created;
    });

    return {
      ...parcel,
      weightKg: Number(parcel.weightKg),
      costLkr: Number(parcel.costLkr),
    };
  }

  async findCustomerParcels(
    customerId: string,
  ): Promise<CustomerParcelRecord[]> {
    const list = await this.prisma.parcel.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return list.map((item) => ({
      ...item,
      weightKg: Number(item.weightKg),
      costLkr: Number(item.costLkr),
    }));
  }

  async findCustomerParcelById(
    customerId: string,
    parcelId: string,
  ): Promise<CustomerParcelRecord | null> {
    const parcel = await this.prisma.parcel.findFirst({
      where: {
        id: parcelId,
        customerId,
      },
      include: {
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!parcel) return null;

    return {
      ...parcel,
      weightKg: Number(parcel.weightKg),
      costLkr: Number(parcel.costLkr),
    };
  }

  /** Tracking-only read contract; existing parcel endpoints retain their shape. */
  findCustomerTrackingParcels(customerId: string) {
    return this.prisma.parcel.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        customerId: true,
        trackingNumber: true,
        status: true,
        senderAddress: true,
        recipientAddress: true,
        createdAt: true,
        updatedAt: true,
        deliveredAt: true,
        statusHistory: {
          select: { id: true, status: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        statusEvents: {
          select: { id: true, status: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  async getCustomerMetrics(customerId: string): Promise<CustomerMetrics> {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    const [activeDeliveries, deliveredThisMonth, needsAttention] =
      await Promise.all([
        this.prisma.parcel.count({
          where: {
            customerId,
            status: {
              in: [
                ParcelStatus.PENDING,
                ParcelStatus.PICKED_UP,
                ParcelStatus.IN_TRANSIT,
                ParcelStatus.OUT_FOR_DELIVERY,
              ],
            },
          },
        }),
        this.prisma.parcel.count({
          where: {
            customerId,
            status: ParcelStatus.DELIVERED,
            deliveredAt: {
              gte: monthStart,
              lt: nextMonthStart,
            },
          },
        }),
        this.prisma.parcel.count({
          where: {
            customerId,
            status: {
              in: [ParcelStatus.FAILED, ParcelStatus.RETURNED],
            },
          },
        }),
      ]);

    return {
      activeDeliveries,
      deliveredThisMonth,
      needsAttention,
    };
  }

  async cancelParcel(
    customerId: string,
    parcelId: string,
  ): Promise<CustomerParcelRecord> {
    const parcel = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.parcel.findUnique({
        where: { id: parcelId },
      });
      if (!existing || existing.customerId !== customerId) {
        throw new Error('Parcel not found');
      }

      const updated = await tx.parcel.update({
        where: { id: parcelId },
        data: {
          status: ParcelStatus.RETURNED,
          statusHistory: {
            create: {
              status: ParcelStatus.RETURNED,
              note: 'Delivery cancelled by customer before pickup.',
            },
          },
        },
        include: {
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      await this.outbox.recordParcelStatusChanged(tx, {
        parcel: updated,
        previousStatus: existing.status,
        newStatus: ParcelStatus.RETURNED,
        failureReason: null,
        courierId: null,
      });

      const txNotif = tx as unknown as TxWithNotification;
      if (txNotif.notification) {
        await txNotif.notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: customerId,
            template: 'parcel_cancelled',
            title: 'Delivery cancelled',
            description: `Delivery request ${updated.trackingNumber} was cancelled.`,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      }

      return updated;
    });

    return {
      ...parcel,
      weightKg: Number(parcel.weightKg),
      costLkr: Number(parcel.costLkr),
    };
  }
}
