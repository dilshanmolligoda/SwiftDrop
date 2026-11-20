import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ListMerchantOrdersDto } from './dto/list-merchant-orders.dto.js';
import {
  MerchantDashboardService,
  type MerchantDashboardResponse,
} from './merchant-dashboard.service.js';
import type {
  MerchantOrderDetail,
  MerchantOrdersPage,
} from './merchant-dashboard.repository.js';

@Controller('merchant')
@Roles(Role.MERCHANT)
export class MerchantDashboardController {
  constructor(
    private readonly merchantDashboardService: MerchantDashboardService,
  ) {}

  @Get('dashboard')
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MerchantDashboardResponse> {
    return this.merchantDashboardService.getDashboard(user.id);
  }

  @Get('orders')
  listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMerchantOrdersDto,
  ): Promise<MerchantOrdersPage> {
    return this.merchantDashboardService.listOrders(user.id, query);
  }

  @Get('orders/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMerchantOrdersDto,
    @Res() response: Response,
  ): Promise<void> {
    const orders = await this.merchantDashboardService.listAllOrders(
      user.id,
      query,
    );
    const escapeCsv = (value: unknown): string => {
      const text =
        value instanceof Date
          ? value.toISOString()
          : typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : '';
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [
      [
        'Tracking number',
        'Order reference',
        'Recipient',
        'Destination',
        'Size',
        'Weight kg',
        'Fee LKR',
        'Status',
        'Created',
        'Source',
      ],
      ...orders.map((order) => [
        order.trackingNumber,
        order.reference,
        order.recipient,
        order.destination,
        order.packageSize ?? '',
        order.weightKg ?? '',
        order.feeLkr ?? '',
        order.status,
        order.createdAt,
        order.source,
      ]),
    ];

    response
      .setHeader(
        'Content-Disposition',
        'attachment; filename="merchant-orders.csv"',
      )
      .status(200)
      .send(rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n'));
  }

  @Get('orders/:orderId')
  getOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<MerchantOrderDetail> {
    return this.merchantDashboardService.getOrder(user.id, orderId);
  }

  @Get('track/:trackingNumber')
  getByTrackingNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Param('trackingNumber') trackingNumber: string,
  ): Promise<MerchantOrderDetail> {
    return this.merchantDashboardService.getByTrackingNumber(
      user.id,
      trackingNumber.trim().toUpperCase(),
    );
  }
}
