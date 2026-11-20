import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { InMemoryWebhooksRepository } from '../../../../test/fakes/in-memory-webhooks.repository.js';
import { WebhookDeliveryStatus } from '../../../generated/prisma/enums.js';
import { encryptWebhookSecret } from '../domain/webhook-secret.js';
import { verifyWebhookSignature } from '../domain/webhook-signature.js';
import type { WebhooksRepository } from '../repositories/webhooks.repository.js';
import { WebhookDeliveryService } from './webhook-delivery.service.js';
import type {
  WebhookHttpClient,
  WebhookHttpResult,
} from './webhook-http.client.js';
import { WebhookSettings } from './webhook-settings.js';

const KEY = randomBytes(32);
const MERCHANT = 'merchant-profile-1';
const SECRET = 'whsec_test_secret';

describe('WebhookDeliveryService', () => {
  let repository: InMemoryWebhooksRepository;
  let responses: WebhookHttpResult[];
  let sent: { url: string; headers: Record<string, string>; body: string }[];
  let service: WebhookDeliveryService;

  const queueEvent = async (endpointUrl = 'http://localhost:5000/hook') => {
    const endpoint =
      repository.endpoints[0] ??
      (await repository.createEndpoint({
        merchantProfileId: MERCHANT,
        url: endpointUrl,
        encryptedSecret: encryptWebhookSecret(SECRET, KEY, MERCHANT),
      }));
    const eventId = randomUUID();
    return repository.createDelivery({
      endpointId: endpoint.id,
      eventId,
      eventType: 'webhook.test',
      payload: { eventId, eventType: 'webhook.test' },
    });
  };

  const respond = (...results: Partial<WebhookHttpResult>[]) => {
    responses.push(
      ...results.map((r) => ({
        statusCode: null,
        error: null,
        durationMs: 12,
        ...r,
      })),
    );
  };

  beforeAll(() => {
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });

  afterAll(() => jest.restoreAllMocks());

  beforeEach(() => {
    repository = new InMemoryWebhooksRepository();
    responses = [];
    sent = [];
    const httpClient = {
      post: (url: string, headers: Record<string, string>, body: string) => {
        sent.push({ url, headers, body });
        return Promise.resolve(
          responses.shift() ?? { statusCode: 200, error: null, durationMs: 5 },
        );
      },
    } as unknown as WebhookHttpClient;
    const env: Record<string, string> = {
      NODE_ENV: 'test',
      WEBHOOK_MAX_ATTEMPTS: '3',
      WEBHOOK_BACKOFF_BASE_MS: '1000',
      WEBHOOK_SECRET_ENCRYPTION_KEY: KEY.toString('base64'),
    };
    const config = { get: (k: string) => env[k] } as unknown as ConfigService;
    service = new WebhookDeliveryService(
      repository as unknown as WebhooksRepository,
      httpClient,
      new WebhookSettings(config),
      config,
    );
  });

  it('marks a delivery DELIVERED on 2xx and logs the attempt', async () => {
    const delivery = await queueEvent();

    await service.attempt(delivery.id);

    expect(repository.deliveries[0]).toMatchObject({
      status: WebhookDeliveryStatus.DELIVERED,
      attemptCount: 1,
      lastStatusCode: 200,
      nextAttemptAt: null,
    });
    expect(repository.attempts).toHaveLength(1);
  });

  it('signs the exact body so the merchant can verify it with their secret', async () => {
    const delivery = await queueEvent();

    await service.attempt(delivery.id);

    const { headers, body } = sent[0];
    expect(headers['X-SwiftDrop-Event-Id']).toBe(delivery.eventId);
    expect(
      verifyWebhookSignature(
        SECRET,
        headers['X-SwiftDrop-Timestamp'],
        body,
        headers['X-SwiftDrop-Signature'],
      ),
    ).toBe(true);
    expect(JSON.parse(body)).toEqual(delivery.payload);
  });

  it('schedules a retry with backoff after a 5xx or no response', async () => {
    const delivery = await queueEvent();
    respond({ statusCode: 503, error: 'HTTP 503' });

    const before = Date.now();
    await service.attempt(delivery.id);

    const updated = repository.deliveries[0];
    expect(updated.status).toBe(WebhookDeliveryStatus.PENDING);
    expect(updated.lastError).toBe('HTTP 503');
    expect(updated.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(
      before + 1000,
    );
  });

  it('retries until delivered, then stops', async () => {
    const delivery = await queueEvent();
    respond(
      { statusCode: null, error: 'Connection refused' },
      { statusCode: 500, error: 'HTTP 500' },
    );

    await service.attempt(delivery.id);
    await service.attempt(delivery.id, new Date(Date.now() + 1_000));
    await service.attempt(delivery.id, new Date(Date.now() + 10_000));

    expect(repository.attempts.map((a) => a.statusCode)).toEqual([
      null,
      500,
      200,
    ]);
    expect(repository.deliveries[0].status).toBe(
      WebhookDeliveryStatus.DELIVERED,
    );
  });

  it('gives up (FAILED) after the last allowed attempt', async () => {
    const delivery = await queueEvent();
    respond({ statusCode: 500 }, { statusCode: 500 }, { statusCode: 500 });

    for (const offset of [0, 1_000, 10_000]) {
      await service.attempt(delivery.id, new Date(Date.now() + offset));
    }

    expect(repository.deliveries[0]).toMatchObject({
      status: WebhookDeliveryStatus.FAILED,
      attemptCount: 3,
      nextAttemptAt: null,
    });
  });

  it('does not retry a non-retryable 4xx', async () => {
    const delivery = await queueEvent();
    respond({ statusCode: 404, error: 'HTTP 404' });

    await service.attempt(delivery.id);

    expect(repository.deliveries[0].status).toBe(WebhookDeliveryStatus.FAILED);
    expect(repository.attempts).toHaveLength(1);
  });

  it('does not send a delivery before its retry time, or twice at once', async () => {
    const delivery = await queueEvent();
    respond({ statusCode: 500 });
    await service.attempt(delivery.id);

    expect(await service.attempt(delivery.id)).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('processDue sends only deliveries that are due', async () => {
    const due = await queueEvent();
    const later = await queueEvent();
    repository.deliveries.find((d) => d.id === later.id)!.nextAttemptAt =
      new Date(Date.now() + 60_000);

    const attempted = await service.processDue();

    expect(attempted).toBe(1);
    expect(sent).toHaveLength(1);
    expect(repository.deliveries.find((d) => d.id === due.id)!.status).toBe(
      WebhookDeliveryStatus.DELIVERED,
    );
  });

  it('retries later when the stored secret cannot be decrypted', async () => {
    const delivery = await queueEvent();
    repository.endpoints[0].encryptedSecret = encryptWebhookSecret(
      SECRET,
      randomBytes(32),
      MERCHANT,
    );

    await service.attempt(delivery.id);

    expect(sent).toHaveLength(0);
    expect(repository.deliveries[0]).toMatchObject({
      status: WebhookDeliveryStatus.PENDING,
      lastError: 'Could not sign the webhook',
    });
  });
});
