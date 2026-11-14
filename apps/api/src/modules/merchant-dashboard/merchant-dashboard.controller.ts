import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
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
  MerchantOrderRecord,
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

  @Get('orders/:orderId')
  getOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<MerchantOrderRecord> {
    return this.merchantDashboardService.getOrder(user.id, orderId);
  }
}
