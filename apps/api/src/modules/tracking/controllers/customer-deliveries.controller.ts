import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '../../../generated/prisma/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type {
  DeliveryHistoryPage,
  DeliverySummary,
} from '../domain/parcel.types.js';
import { DeliveryHistoryQueryDto } from '../dto/delivery-history-query.dto.js';
import { DeliveryHistoryService } from '../services/delivery-history.service.js';

@Controller('customer/deliveries')
@Roles(Role.CUSTOMER)
export class CustomerDeliveriesController {
  constructor(private readonly history: DeliveryHistoryService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DeliveryHistoryQueryDto,
  ): Promise<DeliveryHistoryPage> {
    return this.history.listCustomerDeliveries(user, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser): Promise<DeliverySummary> {
    return this.history.getCustomerSummary(user);
  }
}
