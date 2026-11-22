import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ROLES_KEY } from '../auth/decorators/roles.decorator.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: {
    getDashboard: jest.Mock;
    listApplications: jest.Mock;
    getApplicationDetails: jest.Mock;
    approveApplication: jest.Mock;
    rejectApplication: jest.Mock;
    listCouriers: jest.Mock;
    getCourierDetails: jest.Mock;
    listDeliveries: jest.Mock;
    listUnassignedParcels: jest.Mock;
    assignCourier: jest.Mock;
    getReports: jest.Mock;
  };

  const mockAdminUser: AuthenticatedUser = {
    id: 'admin-uuid-1',
    email: 'admin@swiftdrop.lk',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    adminService = {
      getDashboard: jest.fn(),
      listApplications: jest.fn(),
      getApplicationDetails: jest.fn(),
      approveApplication: jest.fn(),
      rejectApplication: jest.fn(),
      listCouriers: jest.fn(),
      getCourierDetails: jest.fn(),
      listDeliveries: jest.fn(),
      listUnassignedParcels: jest.fn(),
      assignCourier: jest.fn(),
      getReports: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: adminService }],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('is protected with ADMIN and DISPATCHER roles', () => {
    const reflector = new Reflector();
    const roles = reflector.get<Role[]>(ROLES_KEY, AdminController);
    expect(roles).toEqual([Role.ADMIN, Role.DISPATCHER]);
  });

  it('delegates getDashboard to AdminService.getDashboard', async () => {
    adminService.getDashboard.mockResolvedValueOnce({
      kpis: { totalToday: 10 },
    });

    const result = await controller.getDashboard();

    expect(adminService.getDashboard).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kpis: { totalToday: 10 } });
  });

  it('delegates listApplications to AdminService.listApplications with query params', async () => {
    const query = { page: 1, limit: 10 };
    adminService.listApplications.mockResolvedValueOnce({
      data: [],
      pagination: {},
    });

    const result = await controller.listApplications(query);

    expect(adminService.listApplications).toHaveBeenCalledWith(query);
    expect(result).toEqual({ data: [], pagination: {} });
  });

  it('delegates getApplicationDetails to AdminService.getApplicationDetails', async () => {
    adminService.getApplicationDetails.mockResolvedValueOnce({ id: 'app-1' });

    const result = await controller.getApplicationDetails('app-1');

    expect(adminService.getApplicationDetails).toHaveBeenCalledWith('app-1');
    expect(result).toEqual({ id: 'app-1' });
  });

  it('delegates approveApplication to AdminService.approveApplication with current admin id', async () => {
    adminService.approveApplication.mockResolvedValueOnce({
      id: 'user-1',
      approved: true,
    });

    const result = await controller.approveApplication(mockAdminUser, 'user-1');

    expect(adminService.approveApplication).toHaveBeenCalledWith(
      mockAdminUser.id,
      'user-1',
    );
    expect(result).toEqual({ id: 'user-1', approved: true });
  });

  it('delegates rejectApplication to AdminService.rejectApplication with reason dto', async () => {
    const dto = { reason: 'Incomplete business documents' };
    adminService.rejectApplication.mockResolvedValueOnce({
      id: 'user-1',
      rejected: true,
    });

    const result = await controller.rejectApplication(
      mockAdminUser,
      'user-1',
      dto,
    );

    expect(adminService.rejectApplication).toHaveBeenCalledWith(
      mockAdminUser.id,
      'user-1',
      dto,
    );
    expect(result).toEqual({ id: 'user-1', rejected: true });
  });

  it('delegates listCouriers to AdminService.listCouriers', async () => {
    const query = { page: 1, limit: 20 };
    adminService.listCouriers.mockResolvedValueOnce({
      data: [],
      pagination: {},
    });

    const result = await controller.listCouriers(query);

    expect(adminService.listCouriers).toHaveBeenCalledWith(query);
    expect(result).toEqual({ data: [], pagination: {} });
  });

  it('delegates getCourierDetails to AdminService.getCourierDetails', async () => {
    adminService.getCourierDetails.mockResolvedValueOnce({ id: 'courier-1' });

    const result = await controller.getCourierDetails('courier-1');

    expect(adminService.getCourierDetails).toHaveBeenCalledWith('courier-1');
    expect(result).toEqual({ id: 'courier-1' });
  });

  it('delegates listDeliveries to AdminService.listDeliveries', async () => {
    const query = { page: 1, limit: 20 };
    adminService.listDeliveries.mockResolvedValueOnce({
      data: [],
      pagination: {},
    });

    const result = await controller.listDeliveries(query);

    expect(adminService.listDeliveries).toHaveBeenCalledWith(query);
    expect(result).toEqual({ data: [], pagination: {} });
  });

  it('delegates listUnassignedParcels to AdminService.listUnassignedParcels', async () => {
    adminService.listUnassignedParcels.mockResolvedValueOnce([]);

    const result = await controller.listUnassignedParcels();

    expect(adminService.listUnassignedParcels).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it('delegates assignCourier to AdminService.assignCourier with admin user id and dto', async () => {
    const dto = { courierId: 'courier-uuid-1' };
    adminService.assignCourier.mockResolvedValueOnce({
      assignmentId: 'assign-1',
    });

    const result = await controller.assignCourier(
      mockAdminUser,
      'parcel-uuid-1',
      dto,
    );

    expect(adminService.assignCourier).toHaveBeenCalledWith(
      mockAdminUser.id,
      'parcel-uuid-1',
      dto,
    );
    expect(result).toEqual({ assignmentId: 'assign-1' });
  });

  it('delegates getReports to AdminService.getReports', async () => {
    const query = { date: '2026-11-18' };
    adminService.getReports.mockResolvedValueOnce({ metrics: {}, logs: [] });

    const result = await controller.getReports(query);

    expect(adminService.getReports).toHaveBeenCalledWith(query);
    expect(result).toEqual({ metrics: {}, logs: [] });
  });
});
