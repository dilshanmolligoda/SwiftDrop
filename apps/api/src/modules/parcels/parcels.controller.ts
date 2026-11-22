import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ParcelsService } from './parcels.service.js';
import { CreateParcelDto } from './dto/create-parcel.dto.js';
import type {
  CustomerParcelRecord,
  CustomerMetrics,
} from './parcels.repository.js';

@Controller('parcels')
@Roles(Role.CUSTOMER)
export class ParcelsController {
  constructor(private readonly parcelsService: ParcelsService) {}

  @Post()
  createDelivery(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateParcelDto,
  ): Promise<CustomerParcelRecord> {
    return this.parcelsService.create(user, dto);
  }

  @Get('me')
  getMyDeliveries(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerParcelRecord[]> {
    return this.parcelsService.listForCustomer(user.id);
  }

  @Get('metrics')
  getDashboardMetrics(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerMetrics> {
    return this.parcelsService.getMetrics(user.id);
  }

  @Get(':id')
  getParcelDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerParcelRecord> {
    return this.parcelsService.getById(user.id, id);
  }

  @Post(':id/cancel')
  cancelDelivery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerParcelRecord> {
    return this.parcelsService.cancel(user.id, id);
  }
}
