import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export const PUBLIC_TRACKING_WINDOW_MS = 60_000;
export const PUBLIC_TRACKING_PER_ADDRESS_LIMIT = 20;
export const PUBLIC_TRACKING_GLOBAL_LIMIT = 600;
export const PUBLIC_TRACKING_MAX_ADDRESSES = 10_000;

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * Process-local protection, without enabling trust proxy or accepting forwarded
 * client identities. Shared edge/distributed limits are required across replicas.
 */
@Injectable()
export class PublicTrackingRateLimitGuard implements CanActivate {
  private readonly clients = new Map<string, Counter>();
  private global: Counter = { count: 0, resetAt: 0 };
  private nextCleanupAt = Number.POSITIVE_INFINITY;

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');

    const now = Date.now();
    this.pruneExpired(now);
    if (now >= this.global.resetAt) {
      this.global = { count: 0, resetAt: now + PUBLIC_TRACKING_WINDOW_MS };
    }
    if (this.global.count >= PUBLIC_TRACKING_GLOBAL_LIMIT) {
      this.reject(response, this.global.resetAt, now);
    }

    // Never use request.ip, X-Forwarded-For, or a client-supplied tracking value.
    // Missing peer information is one shared bucket, never an unlimited bypass.
    const address = request.socket.remoteAddress ?? 'unknown-peer';
    let client = this.clients.get(address);
    if (!client) {
      if (this.clients.size >= PUBLIC_TRACKING_MAX_ADDRESSES) {
        this.reject(response, this.nextCleanupAt, now);
      }
      client = { count: 0, resetAt: now + PUBLIC_TRACKING_WINDOW_MS };
      this.clients.set(address, client);
      this.nextCleanupAt = Math.min(this.nextCleanupAt, client.resetAt);
    }
    if (client.count >= PUBLIC_TRACKING_PER_ADDRESS_LIMIT) {
      this.reject(response, client.resetAt, now);
    }
    client.count++;
    this.global.count++;
    return true;
  }

  private pruneExpired(now: number): void {
    if (now < this.nextCleanupAt) return;
    let next = Number.POSITIVE_INFINITY;
    for (const [address, client] of this.clients) {
      if (now >= client.resetAt) this.clients.delete(address);
      else next = Math.min(next, client.resetAt);
    }
    this.nextCleanupAt = next;
  }

  private reject(response: Response, resetAt: number, now: number): never {
    const remaining = Number.isFinite(resetAt)
      ? Math.max(1, Math.ceil((resetAt - now) / 1_000))
      : PUBLIC_TRACKING_WINDOW_MS / 1_000;
    response.setHeader('Retry-After', String(remaining));
    throw new HttpException(
      'Too many tracking requests. Please try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
