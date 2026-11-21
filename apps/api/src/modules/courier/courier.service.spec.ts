/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ParcelStatus,
  DeliveryFailureReason,
} from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { OutboxWriter } from '../../infrastructure/outbox/outbox.writer.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { ObjectStorage } from '../../infrastructure/storage/storage.types.js';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto.js';
import { CourierService } from './courier.service.js';
import type { UploadedProofFile } from './interfaces/uploaded-proof-file.interface.js';

const COURIER_ID = '11111111-1111-4111-8111-111111111111';
const PARCEL_ID = '22222222-2222-4222-8222-222222222222';
const ASSIGNMENT_ID = '33333333-3333-4333-8333-333333333333';
const PROOF_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-03T20:00:00.000Z');

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const validPng: UploadedProofFile = {
  buffer: png,
  mimetype: 'image/png',
  originalname: 'proof.png',
  size: png.length,
};

function createHarness() {
  const transactionClient = {
    deliveryAssignment: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    deliveryProof: { findFirst: jest.fn(), create: jest.fn() },
    parcel: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    parcelStatusEvent: { findFirst: jest.fn(), create: jest.fn() },
    notification: { create: jest.fn() },
  };
  const prismaMock = {
    deliveryAssignment: {
      count: jest.fn(),
      findMany: jest.fn(),
      ...transactionClient.deliveryAssignment,
    },
    deliveryProof: transactionClient.deliveryProof,
    parcel: transactionClient.parcel,
    parcelStatusEvent: transactionClient.parcelStatusEvent,
    $transaction: jest.fn(
      async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        callback(transactionClient as unknown as Prisma.TransactionClient),
    ),
  };
  const storage: jest.Mocked<ObjectStorage> = {
    store: jest
      .fn()
      .mockResolvedValue({ key: 'random-proof.png', provider: 'local' }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const outbox = {
    recordParcelStatusChanged: jest.fn().mockResolvedValue('event-id'),
  };
  const service = new CourierService(
    prismaMock as unknown as PrismaService,
    storage,
    outbox as unknown as OutboxWriter,
  );
  return { service, prismaMock, transactionClient, storage, outbox };
}

function activeAssignment(
  status: ParcelStatus = ParcelStatus.OUT_FOR_DELIVERY,
) {
  return {
    id: ASSIGNMENT_ID,
    parcelId: PARCEL_ID,
    courierId: COURIER_ID,
    endedAt: null,
    assignedAt: new Date('2026-11-03T14:00:00.000Z'),
    parcel: { id: PARCEL_ID, status },
  };
}

describe('CourierService', () => {
  describe('getDashboard', () => {
    it("aggregates today's active assignments by status using Asia/Colombo day boundaries", async () => {
      const { service, prismaMock } = createHarness();
      prismaMock.deliveryAssignment.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(6);

      const result = await service.getDashboard(COURIER_ID, NOW);

      expect(result).toEqual({
        timeZone: 'Asia/Colombo',
        date: '2026-11-04',
        totalAssigned: 21,
        pending: 2,
        pickedUp: 1,
        inTransit: 3,
        outForDelivery: 4,
        delivered: 5,
        failed: 6,
      });
      expect(prismaMock.deliveryAssignment.count).toHaveBeenCalledWith({
        where: {
          courierId: COURIER_ID,
          assignedAt: {
            gte: new Date('2026-11-03T18:30:00.000Z'),
            lt: new Date('2026-11-04T18:30:00.000Z'),
          },
          endedAt: null,
          parcel: { status: ParcelStatus.ASSIGNED },
        },
      });
    });
  });

  describe('listTodayDeliveries', () => {
    it('filters by courier, active assignment, status and search; paginates by assignment time', async () => {
      const { service, prismaMock } = createHarness();
      prismaMock.deliveryAssignment.findMany.mockResolvedValue([
        {
          id: ASSIGNMENT_ID,
          assignedAt: new Date('2026-11-03T14:00:00.000Z'),
          parcel: {
            id: PARCEL_ID,
            trackingNumber: 'SD-001',
            recipientName: 'Ada Recipient',
            recipientPhone: '+94770000000',
            recipientAddress: 'Colombo',
            status: ParcelStatus.OUT_FOR_DELIVERY,
          },
        },
      ]);
      prismaMock.deliveryAssignment.count.mockResolvedValue(1);
      const query = Object.assign(new ListDeliveriesQueryDto(), {
        page: 2,
        limit: 10,
        status: ParcelStatus.OUT_FOR_DELIVERY,
        search: 'Ada',
      });

      const result = await service.listTodayDeliveries(COURIER_ID, query, NOW);

      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(result.data[0]).toMatchObject({
        trackingNumber: 'SD-001',
        recipientName: 'Ada Recipient',
        assignmentId: ASSIGNMENT_ID,
      });
      expect(prismaMock.deliveryAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            courierId: COURIER_ID,
            assignedAt: {
              gte: new Date('2026-11-03T18:30:00.000Z'),
              lt: new Date('2026-11-04T18:30:00.000Z'),
            },
            endedAt: null,
            parcel: {
              status: ParcelStatus.OUT_FOR_DELIVERY,
              OR: [
                { trackingNumber: { contains: 'Ada', mode: 'insensitive' } },
                { recipientName: { contains: 'Ada', mode: 'insensitive' } },
              ],
            },
          },
          orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('getDeliveryDetails', () => {
    it('returns parcel, recipient, assignment, event, and safe proof metadata', async () => {
      const { service, prismaMock } = createHarness();
      prismaMock.deliveryAssignment.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
        assignedAt: NOW,
        parcel: {
          id: PARCEL_ID,
          trackingNumber: 'SD-001',
          recipientName: 'Ada Recipient',
          recipientPhone: '+94770000000',
          recipientAddress: 'Colombo',
          deliveryInstructions: 'Ring the bell',
          contentsDescription: 'Books',
          weightGrams: 500,
          status: ParcelStatus.OUT_FOR_DELIVERY,
          statusEvents: [],
          proofs: [
            {
              id: PROOF_ID,
              originalFilename: 'proof.png',
              contentType: 'image/png',
              sizeBytes: 120,
              uploadedAt: NOW,
              courierId: COURIER_ID,
            },
          ],
        },
      });

      const result = await service.getDeliveryDetails(COURIER_ID, PARCEL_ID);

      expect(result).toMatchObject({
        trackingNumber: 'SD-001',
        recipient: {
          name: 'Ada Recipient',
          phone: '+94770000000',
          address: 'Colombo',
          instructions: 'Ring the bell',
        },
        status: ParcelStatus.OUT_FOR_DELIVERY,
        assignment: { id: ASSIGNMENT_ID, assignedAt: NOW },
        proofs: [{ id: PROOF_ID, uploadedByCurrentCourier: true }],
      });
      expect(result.proofs[0]).not.toHaveProperty('storageKey');
    });

    it('returns 404 for a parcel not actively assigned to this courier', async () => {
      const { service, prismaMock } = createHarness();
      prismaMock.deliveryAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.getDeliveryDetails(COURIER_ID, PARCEL_ID),
      ).rejects.toThrow(new NotFoundException('Delivery not found'));
      expect(prismaMock.deliveryAssignment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { parcelId: PARCEL_ID, courierId: COURIER_ID, endedAt: null },
        }),
      );
    });
  });

  describe('updateDeliveryStatus', () => {
    it('allows the next configured status transition', async () => {
      const { service, transactionClient } = createHarness();
      transactionClient.deliveryAssignment.findFirst.mockResolvedValue(
        activeAssignment(ParcelStatus.ASSIGNED),
      );
      transactionClient.parcel.updateMany.mockResolvedValue({ count: 1 });
      transactionClient.parcelStatusEvent.create.mockResolvedValue({
        id: 'picked-up-event',
      });

      const result = await service.updateDeliveryStatus(COURIER_ID, PARCEL_ID, {
        status: ParcelStatus.PICKED_UP,
        note: 'Collected',
      });

      expect(result.status).toBe(ParcelStatus.PICKED_UP);
      expect(transactionClient.parcel.updateMany).toHaveBeenCalledWith({
        where: { id: PARCEL_ID, status: ParcelStatus.ASSIGNED },
        data: { status: ParcelStatus.PICKED_UP },
      });
    });

    it('records a status-changed event in the outbox with the same transaction', async () => {
      const { service, transactionClient, outbox } = createHarness();
      const assignment = activeAssignment(ParcelStatus.ASSIGNED);
      transactionClient.deliveryAssignment.findFirst.mockResolvedValue(
        assignment,
      );
      transactionClient.parcel.updateMany.mockResolvedValue({ count: 1 });
      transactionClient.parcelStatusEvent.create.mockResolvedValue({
        id: 'picked-up-event',
      });

      await service.updateDeliveryStatus(COURIER_ID, PARCEL_ID, {
        status: ParcelStatus.PICKED_UP,
      });

      expect(outbox.recordParcelStatusChanged).toHaveBeenCalledTimes(1);
      expect(outbox.recordParcelStatusChanged).toHaveBeenCalledWith(
        transactionClient,
        {
          parcel: assignment.parcel,
          previousStatus: ParcelStatus.ASSIGNED,
          newStatus: ParcelStatus.PICKED_UP,
          failureReason: undefined,
          courierId: COURIER_ID,
        },
      );
    });

    it('records no event when the status update conflicts', async () => {
      const { service, transactionClient, outbox } = createHarness();
      transactionClient.deliveryAssignment.findFirst.mockResolvedValue(
        activeAssignment(ParcelStatus.ASSIGNED),
      );
      transactionClient.parcel.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateDeliveryStatus(COURIER_ID, PARCEL_ID, {
          status: ParcelStatus.PICKED_UP,
        }),
      ).rejects.toThrow(ConflictException);
      expect(outbox.recordParcelStatusChanged).not.toHaveBeenCalled();
    });

    it('requires proof before a delivered transition', async () => {
      const { service, prismaMock } = createHarness();
      await expect(
        service.updateDeliveryStatus(COURIER_ID, PARCEL_ID, {
          status: ParcelStatus.DELIVERED,
        }),
      ).rejects.toThrow(new BadRequestException('Delivery proof is required'));
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('completes delivery with an owned proof in one serializable transaction', async () => {
      const { service, prismaMock, transactionClient } = createHarness();
      transactionClient.deliveryAssignment.findFirst.mockResolvedValue(
        activeAssignment(),
      );
      transactionClient.deliveryProof.findFirst.mockResolvedValue({
        id: PROOF_ID,
      });
      transactionClient.parcel.updateMany.mockResolvedValue({ count: 1 });
      transactionClient.parcelStatusEvent.create.mockResolvedValue({
        id: 'event-1',
      });

      const result = await service.updateDeliveryStatus(COURIER_ID, PARCEL_ID, {
        status: ParcelStatus.DELIVERED,
        proofId: PROOF_ID,
        note: 'Handed to recipient',
      });

      expect(transactionClient.deliveryProof.findFirst).toHaveBeenCalledWith({
        where: {
          id: PROOF_ID,
          parcelId: PARCEL_ID,
          assignmentId: ASSIGNMENT_ID,
          courierId: COURIER_ID,
        },
        select: { id: true },
      });
      expect(transactionClient.parcel.updateMany).toHaveBeenCalledWith({
        where: { id: PARCEL_ID, status: ParcelStatus.OUT_FOR_DELIVERY },
        data: { status: ParcelStatus.DELIVERED, deliveredProofId: PROOF_ID },
      });
      expect(transactionClient.parcelStatusEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parcelId: PARCEL_ID,
          assignmentId: ASSIGNMENT_ID,
          actorId: COURIER_ID,
          proofId: PROOF_ID,
          status: ParcelStatus.DELIVERED,
          note: 'Handed to recipient',
        }),
      });
      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(result.status).toBe(ParcelStatus.DELIVERED);
    });

    it('rejects a proof uploaded by another courier or for another assignment', async () => {
      const { service, transactionClient } = createHarness();
      transactionClient.deliveryAssignment.findFirst.mockResolvedValue(
        activeAssignment(),
      );
      transactionClient.deliveryProof.findFirst.mockResolvedValue(null);

      await expect(
        service.updateDeliveryStatus(COURIER_ID, PARCEL_ID, {
          status: ParcelStatus.DELIVERED,
          proofId: PROOF_ID,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(transactionClient.parcel.updateMany).not.toHaveBeenCalled();
    });

    it('rejects invalid status transitions', async () => {
      const { service, transactionClient } = createHarness();
      transactionClient.deliveryAssignment.findFirst.mockResolvedValue(
        activeAssignment(ParcelStatus.ASSIGNED),
      );

      await expect(
        service.updateDeliveryStatus(COURIER_ID, PARCEL_ID, {
          status: ParcelStatus.DELIVERED,
          proofId: PROOF_ID,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('records failed delivery with a required reason and optional note transactionally', async () => {
      const { service, transactionClient } = createHarness();
      transactionClient.deliveryAssignment.findFirst.mockResolvedValue(
        activeAssignment(),
      );
      transactionClient.parcel.updateMany.mockResolvedValue({ count: 1 });
      transactionClient.parcelStatusEvent.create.mockResolvedValue({
        id: 'failed-event',
      });

      const result = await service.reportFailure(COURIER_ID, PARCEL_ID, {
        failureReason: DeliveryFailureReason.RECIPIENT_UNAVAILABLE,
        note: 'Attempted call; no answer',
      });

      expect(transactionClient.parcelStatusEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: ParcelStatus.FAILED,
          failureReason: DeliveryFailureReason.RECIPIENT_UNAVAILABLE,
          actorId: COURIER_ID,
          note: 'Attempted call; no answer',
        }),
      });
      expect(result.status).toBe(ParcelStatus.FAILED);
    });

    it('rejects failure without a reason', async () => {
      const { service, prismaMock } = createHarness();
      await expect(
        service.updateDeliveryStatus(COURIER_ID, PARCEL_ID, {
          status: ParcelStatus.FAILED,
        }),
      ).rejects.toThrow(
        new BadRequestException('A failure reason is required'),
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('returns the original failure event for an identical retry', async () => {
      const { service, transactionClient } = createHarness();
      const event = { id: 'failed-event', status: ParcelStatus.FAILED };
      transactionClient.deliveryAssignment.findFirst.mockResolvedValue(
        activeAssignment(ParcelStatus.FAILED),
      );
      transactionClient.parcelStatusEvent.findFirst.mockResolvedValue(event);

      const result = await service.reportFailure(COURIER_ID, PARCEL_ID, {
        failureReason: DeliveryFailureReason.OTHER,
        note: 'Gate closed',
      });

      expect(result).toMatchObject({ duplicate: true, event });
      expect(transactionClient.parcel.updateMany).not.toHaveBeenCalled();
      expect(transactionClient.parcelStatusEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('uploadProof', () => {
    it('stores a valid image and persists only proof metadata', async () => {
      const { service, prismaMock, transactionClient, storage } =
        createHarness();
      prismaMock.deliveryAssignment.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
      });
      transactionClient.deliveryAssignment.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
      });
      transactionClient.deliveryProof.create.mockResolvedValue({
        id: PROOF_ID,
        originalFilename: 'proof.png',
        contentType: 'image/png',
        sizeBytes: png.length,
        uploadedAt: NOW,
      });

      const result = await service.uploadProof(COURIER_ID, PARCEL_ID, validPng);

      expect(storage.store).toHaveBeenCalledWith({
        buffer: png,
        contentType: 'image/png',
      });
      expect(transactionClient.deliveryProof.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parcelId: PARCEL_ID,
          assignmentId: ASSIGNMENT_ID,
          courierId: COURIER_ID,
          storageProvider: 'local',
          storageKey: 'random-proof.png',
          contentType: 'image/png',
          sizeBytes: png.length,
          checksumSha256: expect.any(String),
        }),
        select: expect.any(Object),
      });
      expect(result).not.toHaveProperty('storageKey');
    });

    it('rejects invalid file extension, MIME, or file signature before storage', async () => {
      const { service, storage } = createHarness();
      await expect(
        service.uploadProof(COURIER_ID, PARCEL_ID, {
          ...validPng,
          originalname: 'proof.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.uploadProof(COURIER_ID, PARCEL_ID, {
          ...validPng,
          mimetype: 'image/jpeg',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(storage.store).not.toHaveBeenCalled();
    });

    it('rejects images larger than the upload limit', async () => {
      const { service, storage } = createHarness();

      await expect(
        service.uploadProof(COURIER_ID, PARCEL_ID, {
          ...validPng,
          size: 5 * 1024 * 1024 + 1,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(storage.store).not.toHaveBeenCalled();
    });

    it('rejects uploads when the parcel is not assigned to the courier', async () => {
      const { service, prismaMock, storage } = createHarness();
      prismaMock.deliveryAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.uploadProof(COURIER_ID, PARCEL_ID, validPng),
      ).rejects.toThrow(NotFoundException);
      expect(storage.store).not.toHaveBeenCalled();
    });

    it('removes the stored file if metadata persistence fails', async () => {
      const { service, prismaMock, transactionClient, storage } =
        createHarness();
      prismaMock.deliveryAssignment.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
      });
      transactionClient.deliveryAssignment.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
      });
      transactionClient.deliveryProof.create.mockRejectedValue(
        new Error('database unavailable'),
      );

      await expect(
        service.uploadProof(COURIER_ID, PARCEL_ID, validPng),
      ).rejects.toThrow('database unavailable');
      expect(storage.delete).toHaveBeenCalledWith('random-proof.png');
    });
  });

  describe('assignCourier', () => {
    it('creates assignment, updates parcel, records outbox and notifies customer and courier', async () => {
      const { service, transactionClient, outbox } = createHarness();
      const mockParcel = {
        id: PARCEL_ID,
        customerId: 'customer-123',
        trackingNumber: 'SD-ASSIGNED123',
        status: ParcelStatus.PENDING,
      };
      transactionClient.parcel.findUnique.mockResolvedValue(mockParcel);
      transactionClient.deliveryAssignment.create.mockResolvedValue({
        id: ASSIGNMENT_ID,
        parcelId: PARCEL_ID,
        courierId: COURIER_ID,
      });
      transactionClient.parcel.update.mockResolvedValue({
        ...mockParcel,
        status: ParcelStatus.ASSIGNED,
      });

      const result = await service.assignCourier(
        PARCEL_ID,
        COURIER_ID,
        'dispatcher-1',
      );

      expect(result).toEqual({
        id: ASSIGNMENT_ID,
        parcelId: PARCEL_ID,
        courierId: COURIER_ID,
      });
      expect(outbox.recordParcelStatusChanged).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          newStatus: ParcelStatus.ASSIGNED,
          courierId: COURIER_ID,
        }),
      );
      expect(transactionClient.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'IN_APP',
          recipientUserId: 'customer-123',
          template: 'parcel_assigned',
          title: 'Courier assigned',
        }),
      });
      expect(transactionClient.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'IN_APP',
          recipientUserId: COURIER_ID,
          template: 'courier_new_assignment',
          title: 'New delivery assigned',
        }),
      });
    });

    it('throws NotFoundException when parcel does not exist', async () => {
      const { service, transactionClient } = createHarness();
      transactionClient.parcel.findUnique.mockResolvedValue(null);

      await expect(
        service.assignCourier('non-existent', COURIER_ID, 'dispatcher-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
