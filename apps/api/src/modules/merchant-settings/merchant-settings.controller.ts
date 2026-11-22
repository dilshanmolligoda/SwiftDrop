import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MerchantSettingsService } from './merchant-settings.service.js';
import { UpdateMerchantContactDto } from './dto/update-contact.dto.js';
import { ChangeMerchantPasswordDto } from './dto/change-password.dto.js';
import { UpdateMerchantNotificationsDto } from './dto/update-notifications.dto.js';
import { UpdateMerchantPreferencesDto } from './dto/update-preferences.dto.js';
import { UpdateTwoFactorDto } from './dto/update-two-factor.dto.js';
import { RequestMerchantBusinessUpdateDto } from './dto/request-business-update.dto.js';
import { NotifyApiKeyUpdatedDto } from './dto/notify-api-key-updated.dto.js';

@Controller('merchant/settings')
@Roles(Role.MERCHANT)
export class MerchantSettingsController {
  constructor(private readonly settingsService: MerchantSettingsService) {}

  @Get()
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getSettings(user.id);
  }

  @Patch('contact')
  updateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMerchantContactDto,
  ) {
    return this.settingsService.updateContact(user.id, dto);
  }

  @Post('password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeMerchantPasswordDto,
  ) {
    return this.settingsService.changePassword(user.id, dto);
  }

  @Patch('notifications')
  updateNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMerchantNotificationsDto,
  ) {
    return this.settingsService.updateNotifications(user.id, dto);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMerchantPreferencesDto,
  ) {
    return this.settingsService.updatePreferences(user.id, dto);
  }

  @Patch('two-factor')
  updateTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTwoFactorDto,
  ) {
    return this.settingsService.updateTwoFactor(user.id, dto);
  }

  @Post('business-update')
  requestBusinessUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestMerchantBusinessUpdateDto,
  ) {
    return this.settingsService.requestBusinessUpdate(user.id, dto);
  }

  @Get('business-update')
  listBusinessUpdates(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.listBusinessUpdateRequests(user.id);
  }

  @Get('verification-documents')
  getVerificationDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getVerificationDocuments(user.id);
  }

  @Post('api-keys/notify')
  notifyApiKeyUpdated(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: NotifyApiKeyUpdatedDto,
  ) {
    return this.settingsService.notifyApiKeyUpdated(
      user.id,
      dto.action,
      dto.keyPrefix,
    );
  }
}
