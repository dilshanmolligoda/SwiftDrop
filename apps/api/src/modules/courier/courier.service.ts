import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  ParcelStatus,
  NotificationChannel,
  NotificationStatus,
} from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';
import { OutboxWriter } from '../../infrastructure/outbox/outbox.writer.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../../infrastructure/storage/storage.types.js';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto.js';
import { ReportDeliveryFailureDto } from './dto/report-delivery-failure.dto.js';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto.js';
import type { UploadedProofFile } from './interfaces/uploaded-proof-file.interface.js';

const COLOMBO_TIME_ZONE = 'Asia/Colombo';
const COLOMBO_OFFSET_MINUTES = 5 * 60 + 30;
const MAX_PROOF_SIZE_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

const STATUS_TRANSITIONS: Partial<Record<ParcelStatus, ParcelStatus[]>> = {
  [ParcelStatus.ASSIGNED]: [ParcelStatus.PICKED_UP],
  [ParcelStatus.PICKED_UP]: [ParcelStatus.IN_TRANSIT],
  [ParcelStatus.IN_TRANSIT]: [ParcelStatus.OUT_FOR_DELIVERY],
  [ParcelStatus.OUT_FOR_DELIVERY]: [
    ParcelStatus.DELIVERED,
    ParcelStatus.FAILED,
  ],
};

const DASHBOARD_STATUSES = [
  ParcelStatus.ASSIGNED,
  ParcelStatus.PICKED_UP,
  ParcelStatus.IN_TRANSIT,
  ParcelStatus.OUT_FOR_DELIVERY,
  ParcelStatus.DELIVERED,
  ParcelStatus.FAILED,
] as const;

@Injectable()
export class CourierService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly outbox: OutboxWriter,
  ) {}

  async getDashboard(courierId: string, now = new Date()) {
    const { start, end } = this.getColomboDayRange(now);
    const baseWhere = {
      courierId,
      assignedAt: { gte: start, lt: end },
      endedAt: null,
    };

    const counts = await Promise.all(
      DASHBOARD_STATUSES.map((status) =>
        this.prisma.deliveryAssignment.count({
          where: { ...baseWhere, parcel: { status } },
        }),
      ),
    );
    const [pending, pickedUp, inTransit, outForDelivery, delivered, failed] =
      counts;

    return {
      timeZone: COLOMBO_TIME_ZONE,
      date: this.getDateInTimeZone(now, COLOMBO_TIME_ZONE),
      totalAssigned: counts.reduce((total, count) => total + count, 0),
      pending,
      pickedUp,
      inTransit,
      outForDelivery,
      delivered,
      failed,
    };
  }

  async listTodayDeliveries(
    courierId: string,
    query: ListDeliveriesQueryDto,
    now = new Date(),
  ) {
    const { start, end } = this.getColomboDayRange(now);
    const search = query.search?.trim();
    const where: Prisma.DeliveryAssignmentWhereInput = {
      courierId,
      assignedAt: { gte: start, lt: end },
      endedAt: null,
      ...(query.status ? { parcel: { status: query.status } } : {}),
      ...(search
        ? {
            parcel: {
              ...(query.status ? { status: query.status } : {}),
              OR: [
                { trackingNumber: { contains: search, mode: 'insensitive' } },
                { recipientName: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [assignments, total] = await Promise.all([
      this.prisma.deliveryAssignment.findMany({
        where,
        orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          assignedAt: true,
          parcel: {
            select: {
              id: true,
              trackingNumber: true,
              recipientName: true,
              recipientPhone: true,
              recipientAddress: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.deliveryAssignment.count({ where }),
    ]);

    return {
      data: assignments.map(({ parcel, ...assignment }) => ({
        ...parcel,
        assignmentId: assignment.id,
        assignedAt: assignment.assignedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDeliveryDetails(courierId: string, parcelId: string) {
    const assignment = await this.prisma.deliveryAssignment.findFirst({
      where: { parcelId, courierId, endedAt: null },
      orderBy: { assignedAt: 'desc' },
      include: {
        parcel: {
          include: {
            statusEvents: {
              orderBy: { createdAt: 'asc' },
              include: {
                actor: { select: { id: true, fullName: true } },
                proof: {
                  select: {
                    id: true,
                    originalFilename: true,
                    contentType: true,
                    sizeBytes: true,
                    uploadedAt: true,
                  },
                },
              },
            },
            proofs: {
              orderBy: { uploadedAt: 'desc' },
              select: {
                id: true,
                originalFilename: true,
                contentType: true,
                sizeBytes: true,
                uploadedAt: true,
                courierId: true,
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Delivery not found');
    }

    const { parcel } = assignment;
    return {
      id: parcel.id,
      trackingNumber: parcel.trackingNumber,
      recipient: {
        name: parcel.recipientName,
        phone: parcel.recipientPhone,
        address: parcel.recipientAddress,
        instructions: parcel.deliveryInstructions,
      },
      parcel: {
        contentsDescription: parcel.contentsDescription,
        weightGrams: parcel.weightGrams,
      },
      status: parcel.status,
      assignment: {
        id: assignment.id,
        assignedAt: assignment.assignedAt,
      },
      events: parcel.statusEvents.map((event) => ({
        id: event.id,
        status: event.status,
        note: event.note,
        failureReason: event.failureReason,
        createdAt: event.createdAt,
        actor: event.actor,
        proof: event.proof,
      })),
      proofs: parcel.proofs.map((proof) => ({
        id: proof.id,
        originalFilename: proof.originalFilename,
        contentType: proof.contentType,
        sizeBytes: proof.sizeBytes,
        uploadedAt: proof.uploadedAt,
        uploadedByCurrentCourier: proof.courierId === courierId,
      })),
    };
  }

  async updateDeliveryStatus(
    courierId: string,
    parcelId: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    const normalizedDto = { ...dto, note: dto.note?.trim() || undefined };
    if (dto.status === ParcelStatus.FAILED && !dto.failureReason) {
      throw new BadRequestException('A failure reason is required');
    }
    if (dto.status !== ParcelStatus.FAILED && dto.failureReason) {
      throw new BadRequestException(
        'A failure reason is only valid when status is FAILED',
      );
    }
    if (dto.status === ParcelStatus.DELIVERED && !dto.proofId) {
      throw new BadRequestException('Delivery proof is required');
    }
    if (dto.status !== ParcelStatus.DELIVERED && dto.proofId) {
      throw new BadRequestException(
        'A proof can only be supplied when status is DELIVERED',
      );
    }

    return this.prisma.$transaction(
      (tx) => this.transitionStatus(tx, courierId, parcelId, normalizedDto),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async reportFailure(
    courierId: string,
    parcelId: string,
    dto: ReportDeliveryFailureDto,
  ) {
    return this.updateDeliveryStatus(courierId, parcelId, {
      status: ParcelStatus.FAILED,
      failureReason: dto.failureReason,
      note: dto.note,
    });
  }

  async uploadProof(
    courierId: string,
    parcelId: string,
    file: UploadedProofFile | undefined,
  ) {
    this.validateProofFile(file);
    const validFile = file;
    const assignment = await this.prisma.deliveryAssignment.findFirst({
      where: { parcelId, courierId, endedAt: null },
      select: { id: true },
    });
    if (!assignment) {
      throw new NotFoundException('Delivery not found');
    }

    const stored = await this.storage.store({
      buffer: validFile.buffer,
      contentType: validFile.mimetype,
    });

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const stillAssigned = await tx.deliveryAssignment.findFirst({
            where: {
              id: assignment.id,
              parcelId,
              courierId,
              endedAt: null,
            },
            select: { id: true },
          });
          if (!stillAssigned) {
            throw new NotFoundException('Delivery not found');
          }

          const proof = await tx.deliveryProof.create({
            data: {
              id: randomUUID(),
              parcelId,
              assignmentId: assignment.id,
              courierId,
              storageProvider: stored.provider,
              storageKey: stored.key,
              originalFilename: this.safeOriginalFilename(
                validFile.originalname,
              ),
              contentType: validFile.mimetype,
              sizeBytes: validFile.size,
              checksumSha256: this.sha256(validFile.buffer),
            },
            select: {
              id: true,
              originalFilename: true,
              contentType: true,
              sizeBytes: true,
              uploadedAt: true,
            },
          });
          return proof;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      try {
        await this.storage.delete(stored.key);
      } catch {
        // Preserve the database error; storage cleanup can be retried operationally.
      }
      throw error;
    }
  }

  private async transitionStatus(
    tx: Prisma.TransactionClient,
    courierId: string,
    parcelId: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    const assignment = await tx.deliveryAssignment.findFirst({
      where: { parcelId, courierId, endedAt: null },
      orderBy: { assignedAt: 'desc' },
      include: { parcel: true },
    });
    if (!assignment) {
      throw new NotFoundException('Delivery not found');
    }

    const currentStatus = assignment.parcel.status;
    if (
      currentStatus === ParcelStatus.FAILED &&
      dto.status === ParcelStatus.FAILED
    ) {
      const existing = await tx.parcelStatusEvent.findFirst({
        where: {
          parcelId,
          assignmentId: assignment.id,
          actorId: courierId,
          status: ParcelStatus.FAILED,
          failureReason: dto.failureReason,
          note: dto.note ?? null,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return {
          parcelId,
          status: existing.status,
          event: existing,
          duplicate: true,
        };
      }
    }

    if (!STATUS_TRANSITIONS[currentStatus]?.includes(dto.status)) {
      throw new ConflictException(
        `Invalid delivery status transition: ${currentStatus} -> ${dto.status}`,
      );
    }

    let proofId: string | null = null;
    if (dto.status === ParcelStatus.DELIVERED) {
      const proof = await tx.deliveryProof.findFirst({
        where: {
          id: dto.proofId,
          parcelId,
          assignmentId: assignment.id,
          courierId,
        },
        select: { id: true },
      });
      if (!proof) {
        throw new BadRequestException(
          'A proof uploaded by you for this active assignment is required',
        );
      }
      proofId = proof.id;
    }

    const updated = await tx.parcel.updateMany({
      where: { id: parcelId, status: currentStatus },
      data: {
        status: dto.status,
        ...(proofId ? { deliveredProofId: proofId } : {}),
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException('Delivery status changed; refresh and retry');
    }

    const event = await tx.parcelStatusEvent.create({
      data: {
        id: randomUUID(),
        parcelId,
        assignmentId: assignment.id,
        actorId: courierId,
        proofId,
        status: dto.status,
        note: dto.note?.trim() || null,
        failureReason:
          dto.status === ParcelStatus.FAILED ? dto.failureReason : null,
      },
    });

    // Same transaction: the event exists only if this status change commits.
    await this.outbox.recordParcelStatusChanged(tx, {
      parcel: assignment.parcel,
      previousStatus: currentStatus,
      newStatus: dto.status,
      failureReason: dto.failureReason,
      courierId,
    });

    if ((tx as any).notification) {
      if (
        dto.status === ParcelStatus.PICKED_UP &&
        assignment.parcel.customerId
      ) {
        await (tx as any).notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: assignment.parcel.customerId,
            template: 'parcel_picked_up',
            title: 'Parcel picked up',
            description: `${assignment.parcel.trackingNumber ?? ''} is on its way to the sorting facility.`.trim(),
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      }

      if (
        dto.status === ParcelStatus.IN_TRANSIT &&
        assignment.parcel.customerId
      ) {
        await (tx as any).notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: assignment.parcel.customerId,
            template: 'parcel_in_transit',
            title: 'Parcel in transit',
            description: `Parcel ${assignment.parcel.trackingNumber ?? ''} is in transit between delivery hubs.`.trim(),
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      }

      if (
        dto.status === ParcelStatus.OUT_FOR_DELIVERY &&
        assignment.parcel.customerId
      ) {
        await (tx as any).notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: assignment.parcel.customerId,
            template: 'parcel_out_for_delivery',
            title: 'Out for delivery',
            description: `Out for delivery: ${assignment.parcel.trackingNumber ?? ''} is scheduled to arrive today.`.trim(),
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      }

      if (
        dto.status === ParcelStatus.DELIVERED &&
        assignment.parcel.customerId
      ) {
        await (tx as any).notification.create({
          data: {
            eventId: randomUUID(),
            channel: NotificationChannel.IN_APP,
            recipientUserId: assignment.parcel.customerId,
            template: 'parcel_delivered',
            title: 'Parcel delivered',
            description: `${assignment.parcel.trackingNumber ?? ''} was delivered successfully.`.trim(),
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      }
    }

    return { parcelId, status: dto.status, event, duplicate: false };
  }

  private validateProofFile(
    file: UploadedProofFile | undefined,
  ): asserts file is UploadedProofFile {
    if (!file) {
      throw new BadRequestException('An image file is required');
    }
    if (
      !Buffer.isBuffer(file.buffer) ||
      file.size !== file.buffer.length ||
      file.size < 1 ||
      file.size > MAX_PROOF_SIZE_BYTES
    ) {
      throw new BadRequestException('Image must be between 1 byte and 5 MB');
    }

    const extension = file.originalname
      .slice(file.originalname.lastIndexOf('.'))
      .toLowerCase();
    if (!MIME_EXTENSIONS[file.mimetype]?.includes(extension)) {
      throw new BadRequestException(
        'Image extension and MIME type do not match',
      );
    }

    const bytes = file.buffer;
    const validSignature =
      (file.mimetype === 'image/jpeg' &&
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff) ||
      (file.mimetype === 'image/png' &&
        bytes
          .subarray(0, 8)
          .equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          )) ||
      (file.mimetype === 'image/webp' &&
        bytes.length >= 12 &&
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP');
    if (!validSignature) {
      throw new BadRequestException(
        'Uploaded file is not a valid supported image',
      );
    }
  }

  async assignCourier(
    parcelId: string,
    courierId: string,
    assignedById: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const parcel = await tx.parcel.findUnique({
          where: { id: parcelId },
        });
        if (!parcel) {
          throw new NotFoundException('Parcel not found');
        }

        // End any existing active assignment for this parcel
        await tx.deliveryAssignment.updateMany({
          where: { parcelId, endedAt: null },
          data: { endedAt: new Date() },
        });

        // Create new assignment
        const assignment = await tx.deliveryAssignment.create({
          data: {
            id: randomUUID(),
            parcelId,
            courierId,
            assignedById,
            assignedAt: new Date(),
          },
        });

        // Update parcel status to ASSIGNED
        const updatedParcel = await tx.parcel.update({
          where: { id: parcelId },
          data: { status: ParcelStatus.ASSIGNED },
        });

        // Record status event
        await tx.parcelStatusEvent.create({
          data: {
            id: randomUUID(),
            parcelId,
            assignmentId: assignment.id,
            actorId: assignedById,
            status: ParcelStatus.ASSIGNED,
            note: 'Assigned to courier',
          },
        });

        // Record outbox event
        await this.outbox.recordParcelStatusChanged(tx, {
          parcel: updatedParcel,
          previousStatus: parcel.status,
          newStatus: ParcelStatus.ASSIGNED,
          failureReason: null,
          courierId,
        });

        // In-app notifications
        if ((tx as any).notification) {
          // Customer notification
          await (tx as any).notification.create({
            data: {
              eventId: randomUUID(),
              channel: NotificationChannel.IN_APP,
              recipientUserId: parcel.customerId,
              template: 'parcel_assigned',
              title: 'Courier assigned',
              description: `Courier assigned: A courier has been assigned to collect your parcel ${parcel.trackingNumber}.`,
              status: NotificationStatus.SENT,
              sentAt: new Date(),
            },
          });

          // Courier notification
          await (tx as any).notification.create({
            data: {
              eventId: randomUUID(),
              channel: NotificationChannel.IN_APP,
              recipientUserId: courierId,
              template: 'courier_new_assignment',
              title: 'New delivery assigned',
              description: `Parcel ${parcel.trackingNumber} was assigned to your route.`,
              status: NotificationStatus.SENT,
              sentAt: new Date(),
            },
          });
        }

        return assignment;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private safeOriginalFilename(filename: string): string {
    const basename = filename.replace(/\\/g, '/').split('/').pop() ?? 'proof';
    return basename.replace(/\p{Cc}/gu, '').slice(0, 255) || 'proof';
  }

  private sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private getColomboDayRange(now: Date) {
    const date = this.getDateInTimeZone(now, COLOMBO_TIME_ZONE);
    const [year, month, day] = date.split('-').map(Number);
    const start = new Date(
      Date.UTC(year, month - 1, day) - COLOMBO_OFFSET_MINUTES * 60_000,
    );
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }

  private getDateInTimeZone(date: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    return `${values['year']}-${values['month']}-${values['day']}`;
  }
}
