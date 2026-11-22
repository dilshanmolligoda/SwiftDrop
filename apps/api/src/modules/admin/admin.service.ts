import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  ParcelStatus,
  Role,
} from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AssignCourierDto } from './dto/assign-courier.dto.js';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto.js';
import { ListCouriersQueryDto } from './dto/list-couriers-query.dto.js';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto.js';
import { RejectApplicationDto } from './dto/reject-application.dto.js';
import { ReportsQueryDto } from './dto/reports-query.dto.js';

const TERMINAL_STATUSES: ParcelStatus[] = [
  ParcelStatus.DELIVERED,
  ParcelStatus.FAILED,
  ParcelStatus.RETURNED,
];

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves overall dashboard KPIs for dispatchers/admins.
   */
  async getDashboard() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalToday,
      pendingDispatch,
      activeInTransit,
      deliveredToday,
      failedAttempts,
      activeCouriersCount,
      pendingApprovalsCount,
    ] = await Promise.all([
      // Total parcels created today
      this.prisma.parcel.count({
        where: { createdAt: { gte: todayStart } },
      }),
      // Unassigned parcels waiting for dispatch
      this.prisma.parcel.count({
        where: {
          status: { in: [ParcelStatus.PENDING, ParcelStatus.CREATED] },
          assignments: { none: { endedAt: null } },
        },
      }),
      // Parcels currently on the road
      this.prisma.parcel.count({
        where: {
          status: {
            in: [ParcelStatus.IN_TRANSIT, ParcelStatus.OUT_FOR_DELIVERY],
          },
        },
      }),
      // Parcels successfully delivered today
      this.prisma.parcel.count({
        where: {
          status: ParcelStatus.DELIVERED,
          updatedAt: { gte: todayStart },
        },
      }),
      // Parcels with failed attempts
      this.prisma.parcel.count({
        where: {
          status: ParcelStatus.FAILED,
        },
      }),
      // Approved and active couriers
      this.prisma.user.count({
        where: {
          role: Role.COURIER,
          approvalStatus: ApprovalStatus.APPROVED,
          isActive: true,
        },
      }),
      // Pending user registrations requiring review
      this.prisma.user.count({
        where: {
          approvalStatus: ApprovalStatus.PENDING,
          role: { in: [Role.MERCHANT, Role.COURIER] },
        },
      }),
    ]);

    return {
      kpis: {
        totalToday,
        pendingDispatch,
        activeInTransit,
        deliveredToday,
        failedAttempts,
        activeCouriersCount,
        pendingApprovalsCount,
      },
    };
  }

  /**
   * Lists merchant and courier applications for administrative approval.
   */
  async listApplications(query: ListApplicationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.UserWhereInput = {
      role: query.role ?? { in: [Role.MERCHANT, Role.COURIER] },
      ...(query.status ? { approvalStatus: query.status } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search, mode: 'insensitive' } },
              {
                merchantProfile: {
                  businessName: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneNumber: true,
          role: true,
          approvalStatus: true,
          isActive: true,
          reviewedAt: true,
          reviewedBy: true,
          rejectionReason: true,
          createdAt: true,
          merchantProfile: {
            select: {
              id: true,
              businessName: true,
              businessAddress: true,
              businessType: true,
            },
          },
          courierProfile: {
            select: {
              id: true,
              vehicleType: true,
              licensePlate: true,
              licenseNumber: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves full application details for a specific user.
   */
  async getApplicationDetails(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        approvalStatus: true,
        isActive: true,
        reviewedAt: true,
        reviewedBy: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
        merchantProfile: true,
        courierProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Application not found');
    }

    let reviewerName: string | null = null;
    if (user.reviewedBy) {
      const reviewer = await this.prisma.user.findUnique({
        where: { id: user.reviewedBy },
        select: { fullName: true },
      });
      reviewerName = reviewer?.fullName ?? null;
    }

    return {
      ...user,
      reviewerName,
    };
  }

  /**
   * Approves a merchant or courier application.
   */
  async approveApplication(adminUserId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, approvalStatus: true, email: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.approvalStatus === ApprovalStatus.APPROVED) {
      throw new BadRequestException('User application is already approved');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedBy: adminUserId,
        rejectionReason: null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        approvalStatus: true,
        reviewedAt: true,
        reviewedBy: true,
      },
    });

    this.logger.log(
      `User ${user.id} (${user.email}, ${user.role}) approved by admin ${adminUserId}`,
    );

    return updated;
  }

  /**
   * Rejects a merchant or courier application with a formal reason.
   */
  async rejectApplication(
    adminUserId: string,
    userId: string,
    dto: RejectApplicationDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, approvalStatus: true, email: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedBy: adminUserId,
        rejectionReason: dto.reason.trim(),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        approvalStatus: true,
        reviewedAt: true,
        reviewedBy: true,
        rejectionReason: true,
      },
    });

    this.logger.log(
      `User ${user.id} (${user.email}, ${user.role}) rejected by admin ${adminUserId}. Reason: ${dto.reason}`,
    );

    return updated;
  }

  /**
   * Lists couriers with their profile details and current active workload count.
   */
  async listCouriers(query: ListCouriersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.UserWhereInput = {
      role: Role.COURIER,
      ...(query.status ? { approvalStatus: query.status } : {}),
      ...(query.vehicleType
        ? { courierProfile: { vehicleType: query.vehicleType } }
        : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search, mode: 'insensitive' } },
              {
                courierProfile: {
                  licensePlate: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [couriers, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ fullName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          approvalStatus: true,
          isActive: true,
          createdAt: true,
          courierProfile: {
            select: {
              vehicleType: true,
              licensePlate: true,
              licenseNumber: true,
            },
          },
          courierAssignments: {
            where: {
              endedAt: null,
              parcel: { status: { notIn: TERMINAL_STATUSES } },
            },
            select: { id: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const formatted = couriers.map(({ courierAssignments, ...courier }) => ({
      ...courier,
      activeDeliveriesCount: courierAssignments.length,
    }));

    return {
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single courier details with full workload and recent assignments.
   */
  async getCourierDetails(courierId: string) {
    const courier = await this.prisma.user.findFirst({
      where: { id: courierId, role: Role.COURIER },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        approvalStatus: true,
        isActive: true,
        createdAt: true,
        courierProfile: true,
        courierAssignments: {
          where: { endedAt: null },
          orderBy: { assignedAt: 'desc' },
          select: {
            id: true,
            assignedAt: true,
            parcel: {
              select: {
                id: true,
                trackingNumber: true,
                recipientName: true,
                recipientAddress: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!courier) {
      throw new NotFoundException('Courier not found');
    }

    return {
      ...courier,
      activeDeliveries: courier.courierAssignments.filter(
        (a) => !TERMINAL_STATUSES.includes(a.parcel.status),
      ),
    };
  }

  /**
   * Lists parcels/deliveries with full assignment and customer details.
   */
  async listDeliveries(query: ListDeliveriesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.ParcelWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.courierId
        ? {
            assignments: {
              some: {
                courierId: query.courierId,
                endedAt: null,
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { trackingNumber: { contains: search, mode: 'insensitive' } },
              { recipientName: { contains: search, mode: 'insensitive' } },
              { recipientAddress: { contains: search, mode: 'insensitive' } },
              { senderAddress: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [parcels, total] = await Promise.all([
      this.prisma.parcel.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          trackingNumber: true,
          senderName: true,
          senderAddress: true,
          recipientName: true,
          recipientAddress: true,
          recipientPhone: true,
          packageSize: true,
          weightKg: true,
          costLkr: true,
          status: true,
          failureReason: true,
          failedDeliveryAttempts: true,
          deliveredAt: true,
          createdAt: true,
          merchantOrder: {
            select: {
              reference: true,
              source: true,
            },
          },
          assignments: {
            where: { endedAt: null },
            orderBy: { assignedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              assignedAt: true,
              courier: {
                select: {
                  id: true,
                  fullName: true,
                  phoneNumber: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.parcel.count({ where }),
    ]);

    const formatted = parcels.map(({ assignments, merchantOrder, ...parcel }) => ({
      ...parcel,
      senderName: parcel.senderName || 'Central Warehouse',
      senderAddress: parcel.senderAddress || 'SwiftDrop Hub, Colombo',
      packageSize: parcel.packageSize ? String(parcel.packageSize) : 'MEDIUM',
      weightKg: parcel.weightKg ? String(parcel.weightKg) : '1.00',
      costLkr: parcel.costLkr ? String(parcel.costLkr) : '350.00',
      failureReason: parcel.failureReason ?? null,
      failedDeliveryAttempts: parcel.failedDeliveryAttempts ?? 0,
      deliveredAt: parcel.deliveredAt ? parcel.deliveredAt.toISOString() : null,
      activeAssignment: assignments[0] ?? null,
      orderReference: merchantOrder?.reference ?? null,
    }));

    return {
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lists unassigned parcels that need courier dispatching.
   */
  async listUnassignedParcels() {
    const parcels = await this.prisma.parcel.findMany({
      where: {
        status: { in: [ParcelStatus.PENDING, ParcelStatus.CREATED] },
        assignments: { none: { endedAt: null } },
      },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        trackingNumber: true,
        senderName: true,
        senderAddress: true,
        recipientName: true,
        recipientAddress: true,
        recipientPhone: true,
        packageSize: true,
        weightKg: true,
        costLkr: true,
        status: true,
        createdAt: true,
        merchantOrder: {
          select: {
            reference: true,
            source: true,
          },
        },
      },
    });

    return parcels.map((p) => ({
      id: p.id,
      trackingNumber: p.trackingNumber,
      senderName: p.senderName || 'Central Warehouse',
      senderAddress: p.senderAddress || 'SwiftDrop Hub, Colombo',
      recipientName: p.recipientName,
      recipientAddress: p.recipientAddress,
      recipientPhone: p.recipientPhone,
      packageSize: p.packageSize ? String(p.packageSize) : 'MEDIUM',
      weightKg: p.weightKg ? String(p.weightKg) : '1.00',
      costLkr: p.costLkr ? String(p.costLkr) : '350.00',
      status: p.status,
      createdAt: p.createdAt,
      orderReference: p.merchantOrder?.reference ?? null,
    }));
  }

  /**
   * Atomically assigns a parcel to an approved courier.
   * Enforces 409 Conflict if parcel is already assigned.
   */
  async assignCourier(
    adminUserId: string,
    parcelId: string,
    dto: AssignCourierDto,
  ) {
    // 1. Verify the courier exists and is approved
    const courier = await this.prisma.user.findFirst({
      where: {
        id: dto.courierId,
        role: Role.COURIER,
      },
      select: {
        id: true,
        fullName: true,
        approvalStatus: true,
        isActive: true,
      },
    });

    if (!courier) {
      throw new NotFoundException('Courier not found');
    }

    if (
      courier.approvalStatus !== ApprovalStatus.APPROVED ||
      !courier.isActive
    ) {
      throw new BadRequestException('Courier is not approved or inactive');
    }

    // 2. Atomic transaction to verify unassigned and create assignment
    return this.prisma.$transaction(async (tx) => {
      const parcel = await tx.parcel.findUnique({
        where: { id: parcelId },
        select: { id: true, status: true, trackingNumber: true },
      });

      if (!parcel) {
        throw new NotFoundException('Parcel not found');
      }

      // Check if parcel already has an active assignment
      const existingActiveAssignment = await tx.deliveryAssignment.findFirst({
        where: {
          parcelId,
          endedAt: null,
        },
        select: { id: true, courierId: true },
      });

      if (existingActiveAssignment) {
        throw new ConflictException(
          'Parcel was already assigned to an active courier',
        );
      }

      // Create new assignment
      const assignment = await tx.deliveryAssignment.create({
        data: {
          parcelId,
          courierId: dto.courierId,
          assignedById: adminUserId,
          assignedAt: new Date(),
        },
        select: {
          id: true,
          parcelId: true,
          courierId: true,
          assignedAt: true,
        },
      });

      // Update parcel status to ASSIGNED if currently CREATED or PENDING
      const nextStatus =
        parcel.status === ParcelStatus.PENDING ||
        parcel.status === ParcelStatus.CREATED
          ? ParcelStatus.ASSIGNED
          : parcel.status;

      await tx.parcel.update({
        where: { id: parcelId },
        data: { status: nextStatus },
      });

      // Record parcel status event
      await tx.parcelStatusEvent.create({
        data: {
          parcelId,
          assignmentId: assignment.id,
          actorId: adminUserId,
          status: nextStatus,
          note: `Assigned to courier ${courier.fullName} by dispatcher`,
        },
      });

      // Record parcel status history
      await tx.parcelStatusHistory.create({
        data: {
          parcelId,
          status: nextStatus,
          note: `Assigned to courier ${courier.fullName}`,
        },
      });

      this.logger.log(
        `Parcel ${parcel.trackingNumber} (${parcelId}) assigned to courier ${courier.fullName} (${courier.id}) by admin ${adminUserId}`,
      );

      return {
        assignmentId: assignment.id,
        parcelId,
        courierId: courier.id,
        courierName: courier.fullName,
        status: nextStatus,
        assignedAt: assignment.assignedAt,
      };
    });
  }

  /**
   * Aggregates daily reports and returns completed delivery logs.
   */
  async getReports(query: ReportsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    let startDate: Date;
    let endDate: Date;

    if (query.date) {
      startDate = new Date(query.date);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(query.date);
      endDate.setHours(23, 59, 59, 999);
    } else if (query.startDate && query.endDate) {
      startDate = new Date(query.startDate);
      endDate = new Date(query.endDate);
    } else {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    const baseWhere: Prisma.ParcelWhereInput = {
      updatedAt: { gte: startDate, lte: endDate },
      ...(query.status ? { status: query.status } : {}),
      ...(query.courierId
        ? { assignments: { some: { courierId: query.courierId } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                trackingNumber: { contains: query.search, mode: 'insensitive' },
              },
              {
                recipientName: { contains: query.search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };

    const [deliveredCount, failedCount, parcels, total] = await Promise.all([
      this.prisma.parcel.count({
        where: {
          ...baseWhere,
          status: ParcelStatus.DELIVERED,
        },
      }),
      this.prisma.parcel.count({
        where: {
          ...baseWhere,
          status: ParcelStatus.FAILED,
        },
      }),
      this.prisma.parcel.findMany({
        where: baseWhere,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          trackingNumber: true,
          recipientName: true,
          recipientAddress: true,
          status: true,
          failureReason: true,
          deliveredAt: true,
          updatedAt: true,
          assignments: {
            where: { endedAt: null },
            take: 1,
            select: {
              courier: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.parcel.count({ where: baseWhere }),
    ]);

    const totalCompleted = deliveredCount + failedCount;
    const successRate =
      totalCompleted > 0
        ? Math.round((deliveredCount / totalCompleted) * 100)
        : 0;
    const failureRate =
      totalCompleted > 0 ? Math.round((failedCount / totalCompleted) * 100) : 0;

    const logs = parcels.map((parcel) => ({
      id: parcel.id,
      trackingNumber: parcel.trackingNumber,
      recipientName: parcel.recipientName,
      recipientAddress: parcel.recipientAddress,
      courierName: parcel.assignments[0]?.courier.fullName ?? 'Unassigned',
      status: parcel.status,
      failureReason:
        parcel.failureReason ||
        (parcel.status === ParcelStatus.FAILED ? 'Delivery attempt failed' : null),
      completedAt: parcel.deliveredAt ?? parcel.updatedAt,
    }));

    return {
      metrics: {
        completedAttempts: totalCompleted,
        delivered: deliveredCount,
        failed: failedCount,
        successRate,
        failureRate,
      },
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
