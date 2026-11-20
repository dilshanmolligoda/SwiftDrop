import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithMerchant } from '../guards/api-key.guard.js';
import type { ApiKeyPrincipal } from '../services/api-keys.service.js';

/** The merchant authenticated by ApiKeyGuard. */
export const CurrentMerchant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiKeyPrincipal | null =>
    ctx.switchToHttp().getRequest<RequestWithMerchant>().merchant ?? null,
);
