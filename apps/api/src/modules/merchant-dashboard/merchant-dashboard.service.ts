import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MerchantDashboardRepository } from './merchant-dashboard.repository.js';
import type {
  MerchantOrderDetail,
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
    this.validateDateRange(query);
    return this.merchantDashboardRepository.listOrders(merchantUserId, query);
  }

  private validateDateRange(query: ListMerchantOrdersDto): void {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    for (const value of [query.createdFrom, query.createdTo]) {
      if (value && new Date(`${value}T00:00:00`) > today) {
        throw new BadRequestException('Created dates cannot be in the future');
      }
    }

    if (
      query.createdFrom &&
      query.createdTo &&
      query.createdFrom > query.createdTo
    ) {
      throw new BadRequestException(
        'Created-from date cannot be after created-to date',
      );
    }
  }

  async getOrder(
    merchantUserId: string,
    orderId: string,
  ): Promise<MerchantOrderDetail> {
    const order = await this.merchantDashboardRepository.findOrder(
      merchantUserId,
      orderId,
    );
    if (!order) {
      throw new NotFoundException('Merchant order not found');
    }

    return order;
  }

  async getByTrackingNumber(
    merchantUserId: string,
    trackingNumber: string,
  ): Promise<MerchantOrderDetail> {
    const order =
      await this.merchantDashboardRepository.findByTrackingNumber(
        merchantUserId,
        trackingNumber,
      );
    if (!order) {
      throw new NotFoundException('Merchant parcel not found');
    }
    return order;
  }

  listAllOrders(
    merchantUserId: string,
    query: ListMerchantOrdersDto,
  ): Promise<MerchantOrdersPage['data']> {
    this.validateDateRange(query);
    return this.merchantDashboardRepository.listAllOrders(
      merchantUserId,
      query,
    );
  }
}
