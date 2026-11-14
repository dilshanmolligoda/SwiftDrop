import { Injectable, NotFoundException } from '@nestjs/common';
import { MerchantDashboardRepository } from './merchant-dashboard.repository.js';
import type {
  MerchantDashboardMetrics,
  MerchantOrderRecord,
  MerchantOrdersPage,
} from './merchant-dashboard.repository.js';
import type { ListMerchantOrdersDto } from './dto/list-merchant-orders.dto.js';

export interface MerchantDashboardResponse {
  reportingPeriod: { month: number; year: number };
  metrics: MerchantDashboardMetrics;
  recentOrders: MerchantOrderRecord[];
}

@Injectable()
export class MerchantDashboardService {
  constructor(
    private readonly merchantDashboardRepository: MerchantDashboardRepository,
  ) {}

  async getDashboard(
    merchantUserId: string,
  ): Promise<MerchantDashboardResponse> {
    const now = new Date();
    const { metrics, recentOrders } =
      await this.merchantDashboardRepository.getDashboard(merchantUserId);

    return {
      reportingPeriod: {
        month: now.getUTCMonth() + 1,
        year: now.getUTCFullYear(),
      },
      metrics,
      recentOrders,
    };
  }

  listOrders(
    merchantUserId: string,
    query: ListMerchantOrdersDto,
  ): Promise<MerchantOrdersPage> {
    return this.merchantDashboardRepository.listOrders(merchantUserId, query);
  }

  async getOrder(
    merchantUserId: string,
    orderId: string,
  ): Promise<MerchantOrderRecord> {
    const order = await this.merchantDashboardRepository.findOrder(
      merchantUserId,
      orderId,
    );
    if (!order) {
      throw new NotFoundException('Merchant order not found');
    }

    return order;
  }
}
