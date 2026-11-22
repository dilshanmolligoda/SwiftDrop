/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Jest mock call arguments are typed `any` */
import type { ParcelStatusChangedV1 } from '@swiftdrop/contracts';
import {
  encryptWebhookSecret,
  verifyWebhookSignature,
} from '@swiftdrop/contracts/node';
import type { WorkerConfig } from '../config/worker.config.js';
import { PermanentFailure } from '../messaging/parcel-event-consumer.js';
import { testWorkerConfig } from '../testing/worker-config.fixture.js';
import type { WorkerPublisher } from '../messaging/worker-publisher.js';
import type { WebhookDeliveryRepository } from '../webhooks/webhook-delivery.repository.js';
import type { NotificationRepository } from '../notifications/notification.repository.js';
import type { EmailChannel } from '../notifications/email.channel.js';
import {
  postWebhook,
  type WebhookHttpResult,
} from '../webhooks/webhook-http-client.js';
import { WebhookConsumer } from './webhook.consumer.js';

jest.mock('../webhooks/webhook-http-client.js', () => ({
  postWebhook: jest.fn(),
}));
const post = postWebhook as jest.MockedFunction<typeof postWebhook>;

const MERCHANT = '66666666-6666-4666-8666-666666666666';
const KEY = Buffer.alloc(32, 9);
const SECRET = 'whsec_test-secret';

const EVENT: ParcelStatusChangedV1 = {
  eventId: '6f1c2c8e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
  eventType: 'parcel.status.changed',
  version: 1,
  occurredAt: '2026-11-21T08:30:00.000Z',
  parcelId: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
  trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
  merchantId: MERCHANT,
  courierId: null,
  sequence: 4,
  previousStatus: 'IN_TRANSIT',
  newStatus: 'OUT_FOR_DELIVERY',
  failureReason: null,
};

function config(
  overrides: Partial<WorkerConfig['webhooks']> = {},
): WorkerConfig {
  return testWorkerConfig({ webhooks: { encryptionKey: KEY, ...overrides } });
}

function setup(
  options: {
    url?: string;
    webhooks?: Partial<WorkerConfig['webhooks']>;
  } = {},
) {
  const repository = {
    findActiveEndpoint: jest.fn().mockResolvedValue({
      id: 'endpoint-1',
      merchantUserId: MERCHANT,
      url: options.url ?? 'https://shop.example/webhooks',
      secretEncrypted: encryptWebhookSecret(SECRET, KEY, MERCHANT),
    }),
    findAttempt: jest.fn().mockResolvedValue(null),
    merchantOrderRef: jest.fn().mockResolvedValue('ORDER-42'),
    recordAttempt: jest.fn().mockResolvedValue(undefined),
  };
  const publisher = { sendToQueue: jest.fn().mockResolvedValue(undefined) };
  const notificationRepository = {
    findUserById: jest.fn().mockResolvedValue({
      id: MERCHANT,
      fullName: 'Merchant Partner',
      phoneNumber: '+94771234567',
      email: 'merchant@example.com',
    }),
    record: jest.fn().mockResolvedValue(undefined),
  };
  const emailChannel = {
    send: jest.fn().mockResolvedValue({ status: 'SENT' }),
  };
  const consumer = new WebhookConsumer(
    repository as unknown as WebhookDeliveryRepository,
    publisher as unknown as WorkerPublisher,
    config(options.webhooks),
    notificationRepository as unknown as NotificationRepository,
    emailChannel as unknown as EmailChannel,
  );
  return {
    consumer,
    repository,
    publisher,
    notificationRepository,
    emailChannel,
  };
}

const delivery = (attempt?: number) => ({
  redelivered: false,
  headers: attempt ? { 'x-swiftdrop-attempt': attempt } : {},
});
const respond = (statusCode: number): WebhookHttpResult => ({
  kind: 'response',
  statusCode,
  durationMs: 12,
});

beforeEach(() => post.mockReset());

describe('WebhookConsumer', () => {
  it('does nothing for a customer parcel', async () => {
    const { consumer, repository } = setup();
    await expect(
      consumer.handle({ ...EVENT, merchantId: null }, delivery()),
    ).resolves.toBeUndefined();
    expect(repository.findActiveEndpoint).not.toHaveBeenCalled();
  });

  it('does nothing when the merchant has no webhook', async () => {
    const { consumer, repository } = setup();
    repository.findActiveEndpoint.mockResolvedValue(null);
    await expect(consumer.handle(EVENT, delivery())).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });

  it('sends a correctly signed payload and records DELIVERED', async () => {
    const { consumer, repository, publisher } = setup();
    post.mockResolvedValue(respond(200));

    await expect(consumer.handle(EVENT, delivery())).resolves.toBeUndefined();

    const request = post.mock.calls[0][0];
    const headers = request.headers;
    expect(request.url.href).toBe('https://shop.example/webhooks');
    expect(request.allowPrivate).toBe(false);
    expect(headers['X-SwiftDrop-Event-Id']).toBe(EVENT.eventId);
    expect(headers['X-SwiftDrop-Delivery-Attempt']).toBe('1');
    expect(
      verifyWebhookSignature(
        SECRET,
        headers['X-SwiftDrop-Timestamp'],
        request.body,
        headers['X-SwiftDrop-Signature'],
      ),
    ).toBe(true);
    expect(JSON.parse(request.body)).toEqual({
      eventId: EVENT.eventId,
      eventType: 'parcel.status.changed',
      version: 1,
      occurredAt: EVENT.occurredAt,
      trackingNumber: EVENT.trackingNumber,
      merchantOrderRef: 'ORDER-42',
      status: 'OUT_FOR_DELIVERY',
      previousStatus: 'IN_TRANSIT',
      failureReason: null,
      sequence: 4,
    });
    expect(repository.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        status: 'DELIVERED',
        responseStatus: 200,
        errorMessage: null,
        nextAttemptAt: null,
      }),
    );
    expect(publisher.sendToQueue).not.toHaveBeenCalled();
  });

  it('schedules a retry on 5xx and defers the event', async () => {
    const { consumer, repository, publisher } = setup();
    post.mockResolvedValue(respond(503));

    await expect(consumer.handle(EVENT, delivery(1))).resolves.toBe('deferred');

    expect(repository.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'RETRY_SCHEDULED',
        responseStatus: 503,
        nextAttemptAt: expect.any(Date),
      }),
    );
    const [queue, body, options] = publisher.sendToQueue.mock.calls[0];
    expect(queue).toBe('webhooks.retry.30000ms');
    expect(JSON.parse((body as Buffer).toString()).eventId).toBe(EVENT.eventId);
    expect(options.headers['x-swiftdrop-attempt']).toBe(2);
  });

  it('uses the longer delay queue for later attempts', async () => {
    const { consumer, publisher } = setup();
    post.mockResolvedValue({
      kind: 'network-error',
      error: 'timed out',
      durationMs: 5000,
    });

    await expect(consumer.handle(EVENT, delivery(3))).resolves.toBe('deferred');
    expect(publisher.sendToQueue.mock.calls[0][0]).toBe(
      'webhooks.retry.480000ms',
    );
    expect(
      publisher.sendToQueue.mock.calls[0][2].headers['x-swiftdrop-attempt'],
    ).toBe(4);
  });

  it('dead-letters after the last attempt fails', async () => {
    const {
      consumer,
      repository,
      publisher,
      emailChannel,
      notificationRepository,
    } = setup();
    post.mockResolvedValue(respond(500));

    await expect(consumer.handle(EVENT, delivery(6))).resolves.toBeUndefined();

    expect(repository.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 6, status: 'DEAD_LETTERED' }),
    );
    expect(publisher.sendToQueue).toHaveBeenCalledWith(
      'webhooks.dead-letter',
      expect.any(Buffer),
      expect.objectContaining({ messageId: EVENT.eventId }),
    );
    expect(emailChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'merchant@example.com' }),
      expect.objectContaining({
        template: 'merchant_webhook_dead_letter',
        subject: 'Urgent: Webhook Delivery Failure - SwiftDrop',
      }),
    );
    expect(notificationRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'merchant_webhook_dead_letter',
        channel: 'IN_APP',
        title: 'Webhook delivery failed: Check your webhook endpoint.',
      }),
    );
  });

  it('marks a non-retryable 4xx as FAILED without retrying', async () => {
    const { consumer, repository, publisher } = setup();
    post.mockResolvedValue(respond(401));

    await expect(consumer.handle(EVENT, delivery())).resolves.toBeUndefined();
    expect(repository.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', errorMessage: 'HTTP 401' }),
    );
    expect(publisher.sendToQueue).not.toHaveBeenCalled();
  });

  it('never retries a blocked private address', async () => {
    const { consumer, repository, publisher } = setup();
    post.mockResolvedValue({
      kind: 'blocked',
      error: 'refused to connect to private address 10.0.0.5',
      durationMs: 1,
    });

    await expect(consumer.handle(EVENT, delivery())).resolves.toBeUndefined();
    expect(repository.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
    expect(publisher.sendToQueue).not.toHaveBeenCalled();
  });

  it('refuses plain http in production unless the host is allowlisted', async () => {
    const blocked = setup({
      url: 'http://shop.example/hooks',
      webhooks: { requireHttps: true },
    });
    await blocked.consumer.handle(EVENT, delivery());
    expect(post).not.toHaveBeenCalled();
    expect(blocked.repository.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        errorMessage: 'URL must use https://',
      }),
    );

    const allowed = setup({
      url: 'http://mock-merchant:5000/webhooks/swiftdrop',
      webhooks: {
        requireHttps: true,
        privateHostAllowlist: new Set(['mock-merchant']),
      },
    });
    post.mockResolvedValue(respond(200));
    await allowed.consumer.handle(EVENT, delivery());
    expect(post.mock.calls[0][0].allowPrivate).toBe(true);
  });

  it('on redelivery of a scheduled attempt, re-schedules without calling the merchant again', async () => {
    const { consumer, repository, publisher } = setup();
    repository.findAttempt.mockResolvedValue({
      status: 'RETRY_SCHEDULED',
      nextAttemptAt: new Date(),
    });

    await expect(consumer.handle(EVENT, delivery(2))).resolves.toBe('deferred');
    expect(post).not.toHaveBeenCalled();
    expect(publisher.sendToQueue.mock.calls[0][0]).toBe(
      'webhooks.retry.120000ms',
    );
  });

  it('on redelivery of a finished attempt, does nothing', async () => {
    const { consumer, repository, publisher } = setup();
    repository.findAttempt.mockResolvedValue({
      status: 'DELIVERED',
      nextAttemptAt: null,
    });

    await expect(consumer.handle(EVENT, delivery())).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
    expect(publisher.sendToQueue).not.toHaveBeenCalled();
  });

  it('fails permanently without an encryption key', async () => {
    const { consumer } = setup({ webhooks: { encryptionKey: null } });
    await expect(consumer.handle(EVENT, delivery())).rejects.toBeInstanceOf(
      PermanentFailure,
    );
  });

  it('fails permanently when the secret belongs to another merchant', async () => {
    const { consumer, repository } = setup();
    repository.findActiveEndpoint.mockResolvedValue({
      id: 'endpoint-1',
      merchantUserId: MERCHANT,
      url: 'https://shop.example/webhooks',
      secretEncrypted: encryptWebhookSecret(SECRET, KEY, 'someone-else'),
    });
    await expect(consumer.handle(EVENT, delivery())).rejects.toBeInstanceOf(
      PermanentFailure,
    );
  });
});
