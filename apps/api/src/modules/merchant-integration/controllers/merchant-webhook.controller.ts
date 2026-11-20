import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '../../../generated/prisma/enums.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { SaveWebhookEndpointDto } from '../dto/save-webhook-endpoint.dto.js';
import {
  WebhookEndpointsService,
  type WebhookDeliveryView,
  type WebhookEndpointResult,
  type WebhookEndpointView,
} from '../services/webhook-endpoints.service.js';

/** Signed-in, approved merchants manage where SwiftDrop sends their webhooks. */
@Roles(Role.MERCHANT)
@Controller('merchants/me/webhook')
export class MerchantWebhookController {
  constructor(private readonly webhooks: WebhookEndpointsService) {}

  @Get()
  async get(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ endpoint: WebhookEndpointView | null }> {
    return { endpoint: await this.webhooks.get(user.id) };
  }

  @Put()
  @Header('Cache-Control', 'no-store')
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveWebhookEndpointDto,
  ): Promise<WebhookEndpointResult> {
    return this.webhooks.save(user.id, dto.url);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.webhooks.remove(user.id);
  }

  @Post('rotate-secret')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  rotateSecret(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WebhookEndpointResult> {
    return this.webhooks.rotateSecret(user.id);
  }

  @Post('test')
  @HttpCode(HttpStatus.ACCEPTED)
  sendTest(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WebhookDeliveryView> {
    return this.webhooks.sendTest(user.id);
  }

  @Get('deliveries')
  listDeliveries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<WebhookDeliveryView[]> {
    return this.webhooks.listDeliveries(user.id, limit);
  }

  @Post('deliveries/:id/redeliver')
  @HttpCode(HttpStatus.ACCEPTED)
  redeliver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<WebhookDeliveryView> {
    return this.webhooks.redeliver(user.id, id);
  }
}
