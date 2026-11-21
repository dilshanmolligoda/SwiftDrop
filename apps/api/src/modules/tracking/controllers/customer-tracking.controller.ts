import { Controller, Get, Param } from '@nestjs/common';
import { Role } from '../../../generated/prisma/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { CustomerTrackingResponse } from '../domain/parcel.types.js';
import { TrackingNumberParamsDto } from '../dto/tracking-number-params.dto.js';
import { TrackingService } from '../services/tracking.service.js';

@Controller('customer/tracking')
@Roles(Role.CUSTOMER)
export class CustomerTrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get(':trackingNumber')
  getTracking(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: TrackingNumberParamsDto,
  ): Promise<CustomerTrackingResponse> {
    return this.tracking.getCustomerTracking(user, params.trackingNumber);
  }
}
