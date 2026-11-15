import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '../../generated/prisma/enums.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto.js';
import { ReportDeliveryFailureDto } from './dto/report-delivery-failure.dto.js';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto.js';
import { CourierService } from './courier.service.js';
import type { UploadedProofFile } from './interfaces/uploaded-proof-file.interface.js';

@Controller('courier')
@Roles(Role.COURIER)
export class CourierController {
  constructor(private readonly courierService: CourierService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.courierService.getDashboard(user.id);
  }

  @Get('deliveries/today')
  listTodayDeliveries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDeliveriesQueryDto,
  ) {
    return this.courierService.listTodayDeliveries(user.id, query);
  }

  @Get('deliveries/:parcelId')
  getDeliveryDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', new ParseUUIDPipe()) parcelId: string,
  ) {
    return this.courierService.getDeliveryDetails(user.id, parcelId);
  }

  @Patch('deliveries/:parcelId/status')
  updateDeliveryStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', new ParseUUIDPipe()) parcelId: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.courierService.updateDeliveryStatus(user.id, parcelId, dto);
  }

  @Post('deliveries/:parcelId/proof')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  uploadProof(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', new ParseUUIDPipe()) parcelId: string,
    @UploadedFile() file: UploadedProofFile | undefined,
  ) {
    return this.courierService.uploadProof(user.id, parcelId, file);
  }

  @Post('deliveries/:parcelId/failure')
  reportFailure(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', new ParseUUIDPipe()) parcelId: string,
    @Body() dto: ReportDeliveryFailureDto,
  ) {
    return this.courierService.reportFailure(user.id, parcelId, dto);
  }
}
