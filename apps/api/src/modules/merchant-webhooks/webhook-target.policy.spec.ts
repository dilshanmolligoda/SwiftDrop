import type { MerchantWebhooksConfig } from './merchant-webhooks.config.js';
import { WebhookTargetPolicy } from './webhook-target.policy.js';

function policy(
  overrides: Partial<MerchantWebhooksConfig> = {},
  addresses: Record<string, string[]> = {},
) {
  const resolve = jest.fn((host: string) =>
    host in addresses
      ? Promise.resolve(addresses[host])
      : Promise.reject(new Error('ENOTFOUND')),
  );
  const config: MerchantWebhooksConfig = {
    encryptionKey: null,
    requireHttps: false,
    allowPrivateTargets: false,
    privateHostAllowlist: new Set(),
    ...overrides,
  };
  return { policy: new WebhookTargetPolicy(config, resolve), resolve };
}

describe('WebhookTargetPolicy', () => {
  it('accepts a public host and normalises the URL', async () => {
    const { policy: p } = policy({}, { 'shop.example': ['93.184.216.34'] });
    await expect(p.check('  https://Shop.Example/hooks ')).resolves.toEqual({
      ok: true,
      url: 'https://shop.example/hooks',
    });
  });

  it('rejects a host that resolves to a private address', async () => {
    const { policy: p } = policy({}, { 'internal.example': ['10.0.0.8'] });
    await expect(p.check('https://internal.example/x')).resolves.toEqual({
      ok: false,
      error: 'URL must point to a public internet address',
    });
  });

  it('rejects when any resolved address is private', async () => {
    const { policy: p } = policy(
      {},
      { 'mixed.example': ['93.184.216.34', '127.0.0.1'] },
    );
    await expect(p.check('https://mixed.example/x')).resolves.toMatchObject({
      ok: false,
    });
  });

  it.each([
    'http://127.0.0.1/x',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/x',
  ])('rejects private IP literal %s without DNS', async (url) => {
    const { policy: p, resolve } = policy();
    await expect(p.check(url)).resolves.toMatchObject({ ok: false });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('reports an unresolvable host', async () => {
    const { policy: p } = policy();
    await expect(p.check('https://nope.invalid/x')).resolves.toEqual({
      ok: false,
      error: 'Host nope.invalid could not be resolved',
    });
  });

  it('requires https in production, except for allowlisted hosts', async () => {
    const { policy: p } = policy(
      {
        requireHttps: true,
        privateHostAllowlist: new Set(['mock-merchant']),
      },
      { 'shop.example': ['93.184.216.34'] },
    );
    await expect(p.check('http://shop.example/x')).resolves.toEqual({
      ok: false,
      error: 'URL must use https://',
    });
    await expect(
      p.check('http://mock-merchant:5000/webhooks/swiftdrop'),
    ).resolves.toMatchObject({ ok: true });
  });

  it('allows private targets with the development switch', async () => {
    const { policy: p, resolve } = policy({ allowPrivateTargets: true });
    await expect(p.check('http://localhost:5000/hook')).resolves.toMatchObject({
      ok: true,
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(['ftp://shop.example/x', 'not a url', 'https://u:p@shop.example/x'])(
    'rejects malformed URL %s',
    async (url) => {
      const { policy: p } = policy();
      await expect(p.check(url)).resolves.toMatchObject({ ok: false });
    },
  );
});
