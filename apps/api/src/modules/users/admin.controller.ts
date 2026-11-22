import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { RejectApplicationDto } from './dto/reject-application.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../../generated/prisma/enums.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';

@Controller('admin')
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('couriers/:id/approve')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.OK)
  async approveCourier(
    @Param('id') courierId: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const user = await this.usersService.approveCourier(courierId, admin.id);
    return {
      message: 'Courier approved successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        approvalStatus: user.approvalStatus,
      },
    };
  }

  @Patch('couriers/:id/reject')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.OK)
  async rejectCourier(
    @Param('id') courierId: string,
    @Body() dto: RejectApplicationDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const user = await this.usersService.rejectCourier(
      courierId,
      dto.reason,
      admin.id,
    );
    return {
      message: 'Courier application rejected',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        approvalStatus: user.approvalStatus,
        rejectionReason: user.rejectionReason,
      },
    };
  }
}
