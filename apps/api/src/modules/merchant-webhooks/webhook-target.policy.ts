import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { checkWebhookUrl } from '@swiftdrop/contracts';
import { isPublicAddress } from '@swiftdrop/contracts/node';
import {
  MERCHANT_WEBHOOKS_CONFIG,
  type MerchantWebhooksConfig,
} from './merchant-webhooks.config.js';

export const HOST_RESOLVER = Symbol('HOST_RESOLVER');

/** Resolves a hostname to all its addresses. Injectable so tests need no DNS. */
export type HostResolver = (hostname: string) => Promise<string[]>;

export const dnsHostResolver: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true })).map((entry) => entry.address);

export type TargetCheck =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly error: string };

/**
 * Checks a webhook URL when a merchant saves it, with the same rules the
 * worker applies before every delivery — so mistakes show up immediately, not
 * as failed deliveries later. The worker still re-checks at connect time,
 * because DNS can change after saving.
 */
@Injectable()
export class WebhookTargetPolicy {
  constructor(
    @Inject(MERCHANT_WEBHOOKS_CONFIG)
    private readonly config: MerchantWebhooksConfig,
    @Inject(HOST_RESOLVER) private readonly resolve: HostResolver,
  ) {}

  async check(raw: string): Promise<TargetCheck> {
    const host = hostOf(raw);
    const allowlisted =
      host !== null && this.config.privateHostAllowlist.has(host);

    const format = checkWebhookUrl(raw, {
      requireHttps: this.config.requireHttps && !allowlisted,
    });
    if (!format.ok) return format;

    const url = format.url.href;
    if (this.config.allowPrivateTargets || allowlisted) {
      return { ok: true, url };
    }

    const hostname = format.url.hostname.replace(/^\[|\]$/g, '');
    let addresses: string[];
    if (isIP(hostname)) {
      addresses = [hostname];
    } else {
      try {
        addresses = await this.resolve(hostname);
      } catch {
        return { ok: false, error: `Host ${hostname} could not be resolved` };
      }
    }

    if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
      return {
        ok: false,
        error: 'URL must point to a public internet address',
      };
    }
    return { ok: true, url };
  }
}

function hostOf(raw: string): string | null {
  try {
    return new URL(raw.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}
