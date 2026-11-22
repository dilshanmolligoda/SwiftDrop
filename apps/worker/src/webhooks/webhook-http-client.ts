import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { isPublicAddress } from '@swiftdrop/contracts/node';

export interface WebhookHttpRequest {
  readonly url: URL;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  /** Skip the private-address check (dev switch or allowlisted host). */
  readonly allowPrivate: boolean;
}

export type WebhookHttpResult =
  /** The merchant answered (any status). */
  | {
      readonly kind: 'response';
      readonly statusCode: number;
      readonly durationMs: number;
    }
  /** Timeout, refused, DNS failure … — worth retrying. */
  | {
      readonly kind: 'network-error';
      readonly error: string;
      readonly durationMs: number;
    }
  /** Address on a private network — never retried. */
  | {
      readonly kind: 'blocked';
      readonly error: string;
      readonly durationMs: number;
    };

const USER_AGENT = 'SwiftDrop-Webhooks/1.0';

class BlockedAddressError extends Error {
  constructor(address: string) {
    super(`refused to connect to private address ${address}`);
    this.name = 'BlockedAddressError';
  }
}

/**
 * POSTs one webhook. Redirects are not followed (a 3xx counts as a failed
 * response), the response body is discarded, and when `allowPrivate` is false
 * the address actually connected to must be public — checked inside the DNS
 * lookup, so DNS rebinding can't slip past it.
 */
export function postWebhook(
  req: WebhookHttpRequest,
): Promise<WebhookHttpResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  const literal = isIP(req.url.hostname.replace(/^\[|\]$/g, ''));
  if (literal && !req.allowPrivate) {
    const address = req.url.hostname.replace(/^\[|\]$/g, '');
    if (!isPublicAddress(address)) {
      return Promise.resolve({
        kind: 'blocked',
        error: new BlockedAddressError(address).message,
        durationMs: 0,
      });
    }
  }

  const options: RequestOptions = {
    method: 'POST',
    headers: {
      ...req.headers,
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(req.body)),
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(req.timeoutMs),
    lookup: req.allowPrivate ? undefined : publicOnlyLookup,
  };

  return new Promise((resolve) => {
    const send = req.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(req.url, options, (response) => {
      // We only need the status; drain the body so the socket is released.
      response.resume();
      response.on('end', () =>
        resolve({
          kind: 'response',
          statusCode: response.statusCode ?? 0,
          durationMs: elapsed(),
        }),
      );
      response.on('error', () =>
        resolve({
          kind: 'response',
          statusCode: response.statusCode ?? 0,
          durationMs: elapsed(),
        }),
      );
    });

    request.on('error', (error: Error) => {
      const blocked =
        error instanceof BlockedAddressError ||
        (error as { cause?: unknown }).cause instanceof BlockedAddressError;
      resolve({
        kind: blocked ? 'blocked' : 'network-error',
        error: describeNetworkError(error),
        durationMs: elapsed(),
      });
    });

    request.end(req.body);
  });
}

/** DNS lookup that fails when any resolved address is private. */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '', 4);
      return;
    }
    const list = addresses;
    const blocked = list.find((a) => !isPublicAddress(a.address));
    if (blocked || list.length === 0) {
      callback(new BlockedAddressError(blocked?.address ?? hostname), '', 4);
      return;
    }
    if (options.all) {
      (callback as unknown as (e: null, a: LookupAddress[]) => void)(
        null,
        list,
      );
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
};

function describeNetworkError(error: Error): string {
  if (error instanceof BlockedAddressError) return error.message;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return 'timed out';
  }
  const code = (error as { code?: string }).code;
  return (code ? `${code}: ` : '') + error.message.slice(0, 200);
}
