import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Role } from '../../../generated/prisma/enums.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CreateApiKeyDto } from '../dto/create-api-key.dto.js';
import {
  ApiKeysService,
  type ApiKeySummary,
  type CreatedApiKey,
} from '../services/api-keys.service.js';

/** Signed-in, approved merchants manage their own API keys (JWT cookie session). */
@Roles(Role.MERCHANT)
@Controller('merchants/me/api-keys')
export class MerchantApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreatedApiKey> {
    return this.apiKeysService.create(user.id, dto.name);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ApiKeySummary[]> {
    return this.apiKeysService.list(user.id);
  }

  @Delete(':id')
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ApiKeySummary> {
    return this.apiKeysService.revoke(user.id, id);
  }
}
