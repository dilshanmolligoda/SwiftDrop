import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminService } from './admin.service.js';
import { AssignCourierDto } from './dto/assign-courier.dto.js';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto.js';
import { ListCouriersQueryDto } from './dto/list-couriers-query.dto.js';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto.js';
import { RejectApplicationDto } from './dto/reject-application.dto.js';
import { ReportsQueryDto } from './dto/reports-query.dto.js';

@Controller('admin')
@Roles(Role.ADMIN, Role.DISPATCHER)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('applications')
  listApplications(@Query() query: ListApplicationsQueryDto) {
    return this.adminService.listApplications(query);
  }

  @Get('applications/:id')
  getApplicationDetails(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminService.getApplicationDetails(id);
  }

  @Patch('applications/:id/approve')
  approveApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.adminService.approveApplication(user.id, id);
  }

  @Patch('applications/:id/reject')
  rejectApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectApplicationDto,
  ) {
    return this.adminService.rejectApplication(user.id, id, dto);
  }

  @Get('couriers')
  listCouriers(@Query() query: ListCouriersQueryDto) {
    return this.adminService.listCouriers(query);
  }

  @Get('couriers/:id')
  getCourierDetails(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminService.getCourierDetails(id);
  }

  @Get('deliveries')
  listDeliveries(@Query() query: ListDeliveriesQueryDto) {
    return this.adminService.listDeliveries(query);
  }

  @Get('deliveries/unassigned')
  listUnassignedParcels() {
    return this.adminService.listUnassignedParcels();
  }

  @Post('deliveries/:id/assign')
  @HttpCode(HttpStatus.OK)
  assignCourier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignCourierDto,
  ) {
    return this.adminService.assignCourier(user.id, id, dto);
  }

  @Get('reports')
  getReports(@Query() query: ReportsQueryDto) {
    return this.adminService.getReports(query);
  }
}
