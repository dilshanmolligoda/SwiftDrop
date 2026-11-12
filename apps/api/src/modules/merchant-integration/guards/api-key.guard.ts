import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiKeysService,
  type ApiKeyPrincipal,
} from '../services/api-keys.service.js';

export const API_KEY_HEADER = 'x-api-key';

export type RequestWithMerchant = Request & { merchant?: ApiKeyPrincipal };

/**
 * Authenticates merchant systems by the X-API-Key header and attaches the
 * merchant to the request. Use together with @Public(), so the browser JWT
 * guards are skipped for these server-to-server routes.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMerchant>();
    const header = request.headers[API_KEY_HEADER];
    const plainKey = (Array.isArray(header) ? header[0] : header)?.trim();

    request.merchant = await this.apiKeysService.authenticate(plainKey);
    return true;
  }
}
