import { Injectable } from '@nestjs/common';

export interface WebhookHttpResult {
  /** HTTP status, or null when no response arrived (timeout, refused, DNS). */
  statusCode: number | null;
  error: string | null;
  durationMs: number;
}

/** Sends one webhook HTTP request. Kept separate so tests can replace it. */
@Injectable()
export class WebhookHttpClient {
  async post(
    url: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs: number,
  ): Promise<WebhookHttpResult> {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SwiftDrop-Webhooks/1.0',
          ...headers,
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      // The body is not needed; release the connection.
      await response.body?.cancel().catch(() => undefined);
      return {
        statusCode: response.status,
        error: response.ok ? null : `HTTP ${response.status}`,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        statusCode: null,
        error: describeNetworkError(error, timeoutMs),
        durationMs: Date.now() - startedAt,
      };
    }
  }
}

function describeNetworkError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return `Timed out after ${timeoutMs} ms`;
  }
  const cause = (error as { cause?: { code?: string } })?.cause?.code;
  if (cause === 'ECONNREFUSED') return 'Connection refused';
  if (cause === 'ENOTFOUND') return 'Host not found';
  return 'Network error';
}
