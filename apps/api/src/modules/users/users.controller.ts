import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { AllowUnapproved } from '../auth/decorators/allow-unapproved.decorator.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @AllowUnapproved()
  @Patch('me')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @AllowUnapproved()
  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const userAgent = req.headers['user-agent'];
    return this.usersService.changePassword(user.id, dto, userAgent);
  }
}
