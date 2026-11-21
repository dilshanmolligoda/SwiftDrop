import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ListWebhookDeliveriesDto, SaveWebhookDto } from './dto/webhook.dto.js';
import { MerchantWebhooksService } from './merchant-webhooks.service.js';
import type {
  WebhookDeliveriesPage,
  WebhookSettings,
  WebhookSettingsWithSecret,
} from './merchant-webhooks.service.js';

/**
 * A merchant's own webhook settings and delivery log. The merchant is always
 * the authenticated user — no merchant ID is ever taken from the request.
 */
@Controller('merchant/webhook')
@Roles(Role.MERCHANT)
export class MerchantWebhooksController {
  constructor(private readonly webhooks: MerchantWebhooksService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<WebhookSettings> {
    return this.webhooks.getSettings(user.id);
  }

  /** Responses may contain the signing secret — never cache them. */
  @Put()
  @Header('Cache-Control', 'no-store')
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SaveWebhookDto,
  ): Promise<WebhookSettingsWithSecret> {
    return this.webhooks.saveUrl(user.id, body.url);
  }

  @Post('rotate-secret')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  rotateSecret(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WebhookSettingsWithSecret> {
    return this.webhooks.rotateSecret(user.id);
  }

  @Delete()
  disable(@CurrentUser() user: AuthenticatedUser): Promise<WebhookSettings> {
    return this.webhooks.disable(user.id);
  }

  @Get('deliveries')
  listDeliveries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWebhookDeliveriesDto,
  ): Promise<WebhookDeliveriesPage> {
    return this.webhooks.listDeliveries(user.id, query);
  }
}
