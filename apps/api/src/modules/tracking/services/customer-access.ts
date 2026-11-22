import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';

/** Accept only identity supplied by existing JWT/Roles/Approval guards. */
export function requireCustomer(
  user: AuthenticatedUser | null | undefined,
): string {
  if (!user || typeof user.id !== 'string' || !user.id.trim()) {
    throw new UnauthorizedException('Authentication required');
  }
  if (user.role !== 'CUSTOMER') {
    throw new ForbiddenException('Customer access required');
  }
  // Approval is checked live by the existing ApprovalGuard, not from stale JWT
  // approvalStatus claims. This helper does not establish an HTTP session.
  return user.id;
}
