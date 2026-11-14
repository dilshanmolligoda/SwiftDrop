import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MerchantDashboardRepository,
  type MerchantDashboardMetrics,
  type MerchantOrdersPage,
} from './merchant-dashboard.repository.js';
import { MerchantDashboardService } from './merchant-dashboard.service.js';

describe('MerchantDashboardService', () => {
  let service: MerchantDashboardService;
  const dashboardData: {
    metrics: MerchantDashboardMetrics;
    recentOrders: MerchantOrderRecord[];
  } = {
    metrics: {
      activeDeliveries: 2,
      deliveredThisMonth: 4,
      needsAttention: 1,
    },
    recentOrders: [],
  };
  const ordersPage: MerchantOrdersPage = {
    data: [],
    page: 2,
    pageSize: 10,
    total: 0,
  };
  const dashboardCalls: string[] = [];
  const orderListCalls: {
    merchantUserId: string;
    query: Parameters<MerchantDashboardRepository['listOrders']>[1];
  }[] = [];
  const orderDetailCalls: { merchantUserId: string; orderId: string }[] = [];
  const repository = {
    getDashboard: (merchantUserId: string) => {
      dashboardCalls.push(merchantUserId);
      return Promise.resolve(dashboardData);
    },
    listOrders: (
      merchantUserId: string,
      query: Parameters<MerchantDashboardRepository['listOrders']>[1],
    ) => {
      orderListCalls.push({ merchantUserId, query });
      return Promise.resolve(ordersPage);
    },
    findOrder: (merchantUserId: string, orderId: string) => {
      orderDetailCalls.push({ merchantUserId, orderId });
      return Promise.resolve(null);
    },
  };

  beforeEach(async () => {
    dashboardCalls.length = 0;
    orderListCalls.length = 0;
    orderDetailCalls.length = 0;
    const moduleRef = await Test.createTestingModule({
      providers: [
        MerchantDashboardService,
        { provide: MerchantDashboardRepository, useValue: repository },
      ],
    }).compile();
    service = moduleRef.get(MerchantDashboardService);
  });

  it('returns dashboard data scoped to the authenticated merchant', async () => {
    const result = await service.getDashboard('merchant-1');

    expect(result.metrics).toEqual(dashboardData.metrics);
    expect(result.recentOrders).toEqual(dashboardData.recentOrders);
    expect(result.reportingPeriod.month).toBeGreaterThanOrEqual(1);
    expect(result.reportingPeriod.month).toBeLessThanOrEqual(12);
    expect(result.reportingPeriod.year).toBe(new Date().getUTCFullYear());
    expect(dashboardCalls).toEqual(['merchant-1']);
  });

  it('passes validated order filters and paging to the repository', async () => {
    const query = { search: 'SD-1', page: 2, pageSize: 10 };

    await expect(service.listOrders('merchant-1', query)).resolves.toBe(
      ordersPage,
    );
    expect(orderListCalls).toEqual([{ merchantUserId: 'merchant-1', query }]);
  });

  it('returns 404 when an order is not owned by the merchant', async () => {
    await expect(
      service.getOrder('merchant-1', 'order-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(orderDetailCalls).toEqual([
      { merchantUserId: 'merchant-1', orderId: 'order-1' },
    ]);
  });
});
