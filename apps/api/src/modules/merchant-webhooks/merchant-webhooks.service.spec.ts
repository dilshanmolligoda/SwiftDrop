import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { decryptWebhookSecret } from '@swiftdrop/contracts/node';
import type { MerchantWebhooksConfig } from './merchant-webhooks.config.js';
import type { MerchantWebhooksRepository } from './merchant-webhooks.repository.js';
import { MerchantWebhooksService } from './merchant-webhooks.service.js';
import type { WebhookTargetPolicy } from './webhook-target.policy.js';

const MERCHANT = '66666666-6666-4666-8666-666666666666';
const KEY = Buffer.alloc(32, 4);
const NOW = new Date('2026-11-21T10:00:00.000Z');

const endpoint = (overrides = {}) => ({
  id: 'endpoint-1',
  url: 'https://shop.example/hooks',
  isActive: true,
  secretHint: 'a1B2',
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

function setup(config: Partial<MerchantWebhooksConfig> = {}) {
  const repository = {
    findEndpoint: jest.fn().mockResolvedValue(null),
    createEndpoint: jest.fn((data: { url: string; secretHint: string }) =>
      Promise.resolve(endpoint({ url: data.url, secretHint: data.secretHint })),
    ),
    updateEndpoint: jest.fn((_id: string, data: object) =>
      Promise.resolve(endpoint(data)),
    ),
    listDeliveries: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  };
  const targets = {
    check: jest.fn((url: string) =>
      Promise.resolve({ ok: true as const, url: url.trim() }),
    ),
  };
  const service = new MerchantWebhooksService(
    repository as unknown as MerchantWebhooksRepository,
    targets as unknown as WebhookTargetPolicy,
    {
      encryptionKey: KEY,
      requireHttps: false,
      allowPrivateTargets: false,
      privateHostAllowlist: new Set(),
      ...config,
    },
  );
  return { service, repository, targets };
}

describe('MerchantWebhooksService', () => {
  it('reports "not configured" without an endpoint', async () => {
    const { service } = setup();
    await expect(service.getSettings(MERCHANT)).resolves.toEqual({
      configured: false,
      url: null,
      isActive: false,
      secretHint: null,
      createdAt: null,
      updatedAt: null,
    });
  });

  it('creates a webhook with a new secret, shown once and stored encrypted for this merchant', async () => {
    const { service, repository } = setup();

    const result = await service.saveUrl(
      MERCHANT,
      'https://shop.example/hooks',
    );

    expect(result.signingSecret).toMatch(/^whsec_/);
    const stored = repository.createEndpoint.mock.calls[0][0] as {
      merchantUserId: string;
      secretEncrypted: string;
    };
    expect(stored.merchantUserId).toBe(MERCHANT);
    expect(stored.secretEncrypted).not.toContain(result.signingSecret);
    expect(decryptWebhookSecret(stored.secretEncrypted, KEY, MERCHANT)).toBe(
      result.signingSecret,
    );
    expect(result.secretHint).toBe(`…${result.signingSecret!.slice(-4)}`);
    expect(result).not.toHaveProperty('secretEncrypted');
  });

  it('changes the URL of an existing webhook without changing or returning the secret', async () => {
    const { service, repository } = setup();
    repository.findEndpoint.mockResolvedValue(endpoint({ isActive: false }));

    const result = await service.saveUrl(MERCHANT, 'https://new.example/hooks');

    expect(repository.updateEndpoint).toHaveBeenCalledWith(MERCHANT, {
      url: 'https://new.example/hooks',
      isActive: true,
    });
    expect(result).not.toHaveProperty('signingSecret');
    expect(repository.createEndpoint).not.toHaveBeenCalled();
  });

  it('rejects a URL the target policy refuses', async () => {
    const { service, repository, targets } = setup();
    targets.check.mockResolvedValue({
      ok: false,
      error: 'URL must point to a public internet address',
    } as never);

    await expect(
      service.saveUrl(MERCHANT, 'http://10.0.0.1/x'),
    ).rejects.toThrow(
      new BadRequestException('URL must point to a public internet address'),
    );
    expect(repository.createEndpoint).not.toHaveBeenCalled();
  });

  it('refuses to create a webhook when the server has no encryption key', async () => {
    const { service, repository } = setup({ encryptionKey: null });
    await expect(
      service.saveUrl(MERCHANT, 'https://shop.example/hooks'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.createEndpoint).not.toHaveBeenCalled();
  });

  it('rotates the secret and returns the new one once', async () => {
    const { service, repository } = setup();
    repository.findEndpoint.mockResolvedValue(endpoint());

    const result = await service.rotateSecret(MERCHANT);

    const update = repository.updateEndpoint.mock.calls[0][1] as {
      secretEncrypted: string;
    };
    expect(decryptWebhookSecret(update.secretEncrypted, KEY, MERCHANT)).toBe(
      result.signingSecret,
    );
  });

  it('cannot rotate or disable a webhook that does not exist', async () => {
    const { service } = setup();
    await expect(service.rotateSecret(MERCHANT)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.disable(MERCHANT)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('disables without deleting history', async () => {
    const { service, repository } = setup();
    repository.findEndpoint.mockResolvedValue(endpoint());
    const result = await service.disable(MERCHANT);
    expect(repository.updateEndpoint).toHaveBeenCalledWith(MERCHANT, {
      isActive: false,
    });
    expect(result.isActive).toBe(false);
  });

  it('pages deliveries for the authenticated merchant only, with ISO dates', async () => {
    const { service, repository } = setup();
    repository.listDeliveries.mockResolvedValue({
      items: [
        {
          id: 'd1',
          eventId: 'e1',
          eventType: 'parcel.status.changed',
          trackingNumber: 'SD-1',
          attempt: 2,
          status: 'RETRY_SCHEDULED',
          responseStatus: 503,
          durationMs: 40,
          errorMessage: 'HTTP 503',
          nextAttemptAt: NOW,
          createdAt: NOW,
        },
      ],
      total: 41,
    });

    const page = await service.listDeliveries(MERCHANT, {
      page: 3,
      pageSize: 20,
      status: 'RETRY_SCHEDULED',
    });

    expect(repository.listDeliveries).toHaveBeenCalledWith(MERCHANT, {
      page: 3,
      pageSize: 20,
      status: 'RETRY_SCHEDULED',
    });
    expect(page).toMatchObject({ page: 3, pageSize: 20, total: 41 });
    expect(page.items[0].nextAttemptAt).toBe(NOW.toISOString());
  });
});
