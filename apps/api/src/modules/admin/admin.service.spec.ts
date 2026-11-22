/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  ParcelStatus,
  Role,
  VehicleType,
} from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AdminService } from './admin.service.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const COURIER_ID = '22222222-2222-4222-8222-222222222222';
const PARCEL_ID = '33333333-3333-4333-8333-333333333333';
const ASSIGNMENT_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';

function createHarness() {
  const transactionClient = {
    parcel: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    deliveryAssignment: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    parcelStatusEvent: {
      create: jest.fn(),
    },
    parcelStatusHistory: {
      create: jest.fn(),
    },
  };

  const prismaMock = {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    parcel: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      ...transactionClient.parcel,
    },
    deliveryAssignment: {
      findFirst: jest.fn(),
      ...transactionClient.deliveryAssignment,
    },
    $transaction: jest.fn(
      async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        callback(transactionClient as unknown as Prisma.TransactionClient),
    ),
  };

  const service = new AdminService(prismaMock as unknown as PrismaService);

  return { service, prismaMock, transactionClient };
}

describe('AdminService', () => {
  describe('getDashboard', () => {
    it('aggregates all dispatch KPIs correctly', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.parcel.count
        .mockResolvedValueOnce(50) // totalToday
        .mockResolvedValueOnce(12) // pendingDispatch
        .mockResolvedValueOnce(25) // activeInTransit
        .mockResolvedValueOnce(10) // deliveredToday
        .mockResolvedValueOnce(3); // failedAttempts

      prismaMock.user.count
        .mockResolvedValueOnce(8) // activeCouriersCount
        .mockResolvedValueOnce(4); // pendingApprovalsCount

      const result = await service.getDashboard();

      expect(result.kpis).toEqual({
        totalToday: 50,
        pendingDispatch: 12,
        activeInTransit: 25,
        deliveredToday: 10,
        failedAttempts: 3,
        activeCouriersCount: 8,
        pendingApprovalsCount: 4,
      });
    });
  });

  describe('listApplications', () => {
    it('returns paginated merchant and courier applications', async () => {
      const { service, prismaMock } = createHarness();

      const mockUsers = [
        {
          id: USER_ID,
          email: 'merchant@store.lk',
          fullName: 'Saman Silva',
          role: Role.MERCHANT,
          approvalStatus: ApprovalStatus.PENDING,
          createdAt: new Date(),
          merchantProfile: {
            id: 'm-1',
            businessName: 'Silva Stores',
            businessAddress: 'Colombo 03',
            businessType: 'Retail',
          },
          courierProfile: null,
        },
      ];

      prismaMock.user.findMany.mockResolvedValueOnce(mockUsers);
      prismaMock.user.count.mockResolvedValueOnce(1);

      const result = await service.listApplications({
        page: 1,
        limit: 10,
        status: ApprovalStatus.PENDING,
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 0,
        }),
      );
    });
  });

  describe('getApplicationDetails', () => {
    it('returns full application details including reviewer name when available', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findUnique
        .mockResolvedValueOnce({
          id: USER_ID,
          fullName: 'Applicant',
          email: 'app@example.com',
          role: Role.MERCHANT,
          approvalStatus: ApprovalStatus.APPROVED,
          reviewedBy: ADMIN_ID,
          merchantProfile: { businessName: 'Test Biz' },
          courierProfile: null,
        })
        .mockResolvedValueOnce({
          fullName: 'Admin User',
        });

      const result = await service.getApplicationDetails(USER_ID);

      expect(result.id).toBe(USER_ID);
      expect(result.reviewerName).toBe('Admin User');
    });

    it('throws NotFoundException when application does not exist', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.getApplicationDetails(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approveApplication', () => {
    it('approves a pending user application and records reviewer metadata', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: USER_ID,
        approvalStatus: ApprovalStatus.PENDING,
        email: 'courier@test.lk',
        role: Role.COURIER,
      });

      prismaMock.user.update.mockResolvedValueOnce({
        id: USER_ID,
        email: 'courier@test.lk',
        fullName: 'Kamal Courier',
        role: Role.COURIER,
        approvalStatus: ApprovalStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedBy: ADMIN_ID,
      });

      const result = await service.approveApplication(ADMIN_ID, USER_ID);

      expect(result.approvalStatus).toBe(ApprovalStatus.APPROVED);
      expect(result.reviewedBy).toBe(ADMIN_ID);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: expect.objectContaining({
          approvalStatus: ApprovalStatus.APPROVED,
          reviewedBy: ADMIN_ID,
          rejectionReason: null,
        }),
        select: expect.any(Object),
      });
    });

    it('throws BadRequestException if user is already approved', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: USER_ID,
        approvalStatus: ApprovalStatus.APPROVED,
        email: 'courier@test.lk',
        role: Role.COURIER,
      });

      await expect(
        service.approveApplication(ADMIN_ID, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if user is not found', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.approveApplication(ADMIN_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectApplication', () => {
    it('rejects a user application with a recorded reason', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: USER_ID,
        approvalStatus: ApprovalStatus.PENDING,
        email: 'applicant@test.lk',
        role: Role.MERCHANT,
      });

      prismaMock.user.update.mockResolvedValueOnce({
        id: USER_ID,
        email: 'applicant@test.lk',
        fullName: 'Applicant',
        role: Role.MERCHANT,
        approvalStatus: ApprovalStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedBy: ADMIN_ID,
        rejectionReason: 'Invalid business registration documents',
      });

      const result = await service.rejectApplication(ADMIN_ID, USER_ID, {
        reason: 'Invalid business registration documents',
      });

      expect(result.approvalStatus).toBe(ApprovalStatus.REJECTED);
      expect(result.rejectionReason).toBe(
        'Invalid business registration documents',
      );
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: expect.objectContaining({
          approvalStatus: ApprovalStatus.REJECTED,
          reviewedBy: ADMIN_ID,
          rejectionReason: 'Invalid business registration documents',
        }),
        select: expect.any(Object),
      });
    });

    it('throws NotFoundException if user is not found', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.rejectApplication(ADMIN_ID, USER_ID, {
          reason: 'Invalid documents',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listCouriers', () => {
    it('calculates active delivery workload for each courier', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findMany.mockResolvedValueOnce([
        {
          id: COURIER_ID,
          fullName: 'Nuwan Silva',
          email: 'nuwan@courier.lk',
          phoneNumber: '+94771234567',
          approvalStatus: ApprovalStatus.APPROVED,
          isActive: true,
          createdAt: new Date(),
          courierProfile: {
            vehicleType: VehicleType.MOTORCYCLE,
            licensePlate: 'WP-AB-1234',
            licenseNumber: 'B1234567',
          },
          courierAssignments: [{ id: 'a1' }, { id: 'a2' }],
        },
      ]);
      prismaMock.user.count.mockResolvedValueOnce(1);

      const result = await service.listCouriers({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].activeDeliveriesCount).toBe(2);
    });
  });

  describe('getCourierDetails', () => {
    it('returns courier details and filters active deliveries', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: COURIER_ID,
        fullName: 'Nuwan Silva',
        email: 'nuwan@courier.lk',
        role: Role.COURIER,
        courierProfile: { vehicleType: VehicleType.MOTORCYCLE },
        courierAssignments: [
          {
            id: 'a1',
            assignedAt: new Date(),
            parcel: { id: 'p1', status: ParcelStatus.OUT_FOR_DELIVERY },
          },
          {
            id: 'a2',
            assignedAt: new Date(),
            parcel: { id: 'p2', status: ParcelStatus.DELIVERED },
          },
        ],
      });

      const result = await service.getCourierDetails(COURIER_ID);

      expect(result.id).toBe(COURIER_ID);
      expect(result.activeDeliveries).toHaveLength(1);
      expect(result.activeDeliveries[0].id).toBe('a1');
    });

    it('throws NotFoundException if courier is not found', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      await expect(service.getCourierDetails(COURIER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assignCourier', () => {
    it('successfully assigns an unassigned parcel to an approved courier in a transaction', async () => {
      const { service, prismaMock, transactionClient } = createHarness();

      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: COURIER_ID,
        fullName: 'Kasun Perera',
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
      });

      transactionClient.parcel.findUnique.mockResolvedValueOnce({
        id: PARCEL_ID,
        status: ParcelStatus.PENDING,
        trackingNumber: 'SD-10001',
      });

      transactionClient.deliveryAssignment.findFirst.mockResolvedValueOnce(
        null,
      ); // No active assignment

      transactionClient.deliveryAssignment.create.mockResolvedValueOnce({
        id: ASSIGNMENT_ID,
        parcelId: PARCEL_ID,
        courierId: COURIER_ID,
        assignedAt: new Date('2026-11-18T10:00:00.000Z'),
      });

      transactionClient.parcel.update.mockResolvedValueOnce({});
      transactionClient.parcelStatusEvent.create.mockResolvedValueOnce({});
      transactionClient.parcelStatusHistory.create.mockResolvedValueOnce({});

      const result = await service.assignCourier(ADMIN_ID, PARCEL_ID, {
        courierId: COURIER_ID,
      });

      expect(result.assignmentId).toBe(ASSIGNMENT_ID);
      expect(result.parcelId).toBe(PARCEL_ID);
      expect(result.courierId).toBe(COURIER_ID);
      expect(result.status).toBe(ParcelStatus.ASSIGNED);

      expect(transactionClient.deliveryAssignment.create).toHaveBeenCalledWith({
        data: {
          parcelId: PARCEL_ID,
          courierId: COURIER_ID,
          assignedById: ADMIN_ID,
          assignedAt: expect.any(Date),
        },
        select: expect.any(Object),
      });

      expect(transactionClient.parcel.update).toHaveBeenCalledWith({
        where: { id: PARCEL_ID },
        data: { status: ParcelStatus.ASSIGNED },
      });
    });

    it('throws 409 ConflictException when parcel was already assigned to another courier', async () => {
      const { service, prismaMock, transactionClient } = createHarness();

      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: COURIER_ID,
        fullName: 'Kasun Perera',
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
      });

      transactionClient.parcel.findUnique.mockResolvedValueOnce({
        id: PARCEL_ID,
        status: ParcelStatus.PENDING,
        trackingNumber: 'SD-10001',
      });

      // Existing active assignment found!
      transactionClient.deliveryAssignment.findFirst.mockResolvedValueOnce({
        id: 'existing-assignment',
        courierId: 'another-courier',
      });

      await expect(
        service.assignCourier(ADMIN_ID, PARCEL_ID, {
          courierId: COURIER_ID,
        }),
      ).rejects.toThrow(ConflictException);

      expect(
        transactionClient.deliveryAssignment.create,
      ).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if courier is not approved', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: COURIER_ID,
        fullName: 'Unapproved Courier',
        approvalStatus: ApprovalStatus.PENDING,
        isActive: true,
      });

      await expect(
        service.assignCourier(ADMIN_ID, PARCEL_ID, {
          courierId: COURIER_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if courier does not exist', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.assignCourier(ADMIN_ID, PARCEL_ID, {
          courierId: COURIER_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if parcel does not exist', async () => {
      const { service, prismaMock, transactionClient } = createHarness();

      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: COURIER_ID,
        fullName: 'Kasun Perera',
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
      });

      transactionClient.parcel.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.assignCourier(ADMIN_ID, PARCEL_ID, {
          courierId: COURIER_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getReports', () => {
    it('aggregates daily delivery totals and computes success/failure rates', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.parcel.count
        .mockResolvedValueOnce(45) // delivered
        .mockResolvedValueOnce(5) // failed
        .mockResolvedValueOnce(50); // total

      prismaMock.parcel.findMany.mockResolvedValueOnce([
        {
          id: PARCEL_ID,
          trackingNumber: 'SD-10001',
          recipientName: 'Kasun Silva',
          recipientAddress: 'Colombo 03',
          status: ParcelStatus.DELIVERED,
          failureReason: null,
          deliveredAt: new Date(),
          updatedAt: new Date(),
          assignments: [
            {
              courier: {
                id: COURIER_ID,
                fullName: 'Nuwan Courier',
              },
            },
          ],
        },
      ]);

      const result = await service.getReports({
        date: '2026-11-18',
      });

      expect(result.metrics).toEqual({
        completedAttempts: 50,
        delivered: 45,
        failed: 5,
        successRate: 90,
        failureRate: 10,
      });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].courierName).toBe('Nuwan Courier');
    });

    it('handles zero deliveries gracefully with 0% success and failure rate', async () => {
      const { service, prismaMock } = createHarness();

      prismaMock.parcel.count
        .mockResolvedValueOnce(0) // delivered
        .mockResolvedValueOnce(0) // failed
        .mockResolvedValueOnce(0); // total

      prismaMock.parcel.findMany.mockResolvedValueOnce([]);

      const result = await service.getReports({
        date: '2026-11-18',
      });

      expect(result.metrics.successRate).toBe(0);
      expect(result.metrics.failureRate).toBe(0);
      expect(result.metrics.completedAttempts).toBe(0);
    });
  });
});
