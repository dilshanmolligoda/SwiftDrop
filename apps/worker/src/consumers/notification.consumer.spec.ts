import type {
  ParcelCreatedV1,
  ParcelStatusChangedV1,
} from '@swiftdrop/contracts';
import type {
  NotificationChannel,
  Recipient,
  RenderedNotification,
  SendResult,
} from '../notifications/notification-channel.js';
import type { NotificationRepository } from '../notifications/notification.repository.js';
import { DEFAULT_NOTIFY_STATUSES } from '../config/worker.config.js';
import { testWorkerConfig } from '../testing/worker-config.fixture.js';
import { NotificationConsumer } from './notification.consumer.js';

const EVENT: ParcelStatusChangedV1 = {
  eventId: '6f1c2c8e-1b2a-4c3d-9e8f-0a1b2c3d4e5f',
  eventType: 'parcel.status.changed',
  version: 1,
  occurredAt: '2026-11-21T08:30:00.000Z',
  parcelId: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
  trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
  merchantId: null,
  courierId: null,
  sequence: 3,
  previousStatus: 'IN_TRANSIT',
  newStatus: 'OUT_FOR_DELIVERY',
  failureReason: null,
};

const CUSTOMER: Recipient = {
  userId: '22222222-2222-4222-8222-222222222222',
  fullName: 'Nimal Perera',
  email: 'nimal@example.com',
  phoneNumber: '+94770000000',
};

function channel(
  name: 'EMAIL' | 'SMS',
  result: SendResult | Error = { status: 'SENT' },
) {
  const send = jest.fn<Promise<SendResult>, [Recipient, RenderedNotification]>(
    () =>
      result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result),
  );
  return { channel: name, send } satisfies NotificationChannel;
}

function setup(channels = [channel('EMAIL'), channel('SMS')]) {
  const repository = {
    findRecipient: jest.fn().mockResolvedValue(CUSTOMER),
    alreadyHandled: jest.fn().mockResolvedValue(false),
    record: jest.fn().mockResolvedValue(undefined),
  };
  const consumer = new NotificationConsumer(
    repository as unknown as NotificationRepository,
    channels,
    testWorkerConfig(),
  );
  return { consumer, repository, channels };
}

describe('NotificationConsumer', () => {
  it('sends on every channel and records each result', async () => {
    const { consumer, repository, channels } = setup();

    await consumer.handle(EVENT);

    for (const c of channels) {
      expect(c.send).toHaveBeenCalledWith(
        CUSTOMER,
        expect.objectContaining({ template: 'parcel-out-for-delivery' }),
      );
    }
    expect(repository.record).toHaveBeenCalledWith({
      eventId: EVENT.eventId,
      channel: 'EMAIL',
      recipientUserId: CUSTOMER.userId,
      template: 'parcel-out-for-delivery',
      status: 'SENT',
      errorMessage: null,
    });
    expect(repository.record).toHaveBeenCalledTimes(2);
  });

  it('skips statuses customers are not told about, without touching the database', async () => {
    const { consumer, repository } = setup();
    await consumer.handle({ ...EVENT, newStatus: 'ASSIGNED' });
    expect(repository.findRecipient).not.toHaveBeenCalled();
  });

  it('does nothing when the customer no longer exists', async () => {
    const { consumer, repository, channels } = setup();
    repository.findRecipient.mockResolvedValue(null);
    await consumer.handle(EVENT);
    expect(channels[0].send).not.toHaveBeenCalled();
  });

  it('records SKIPPED and FAILED results with their reason', async () => {
    const { consumer, repository } = setup([
      channel('EMAIL', { status: 'FAILED', reason: 'SMTP 550' }),
      channel('SMS', {
        status: 'SKIPPED',
        reason: 'recipient has no phone number',
      }),
    ]);
    await consumer.handle(EVENT);
    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'EMAIL',
        status: 'FAILED',
        errorMessage: 'SMTP 550',
      }),
    );
    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'SMS', status: 'SKIPPED' }),
    );
  });

  it('throws on a temporary failure so the message is retried', async () => {
    const sms = channel('SMS');
    const { consumer, repository } = setup([
      channel('EMAIL', new Error('connect ECONNREFUSED')),
      sms,
    ]);
    await expect(consumer.handle(EVENT)).rejects.toThrow('ECONNREFUSED');
    expect(repository.record).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('on retry, skips channels that already have a result (no duplicate email)', async () => {
    const email = channel('EMAIL');
    const sms = channel('SMS');
    const { consumer, repository } = setup([email, sms]);
    repository.alreadyHandled.mockImplementation(
      (_eventId: string, name: string) => Promise.resolve(name === 'EMAIL'),
    );

    await consumer.handle(EVENT);

    expect(email.send).not.toHaveBeenCalled();
    expect(sms.send).toHaveBeenCalledTimes(1);
  });

  it('handles parcel.created event and sends booking confirmation email', async () => {
    const { consumer, repository, channels } = setup();
    const createdEvent: ParcelCreatedV1 = {
      eventId: '7f1c2c8e-1b2a-4c3d-9e8f-0a1b2c3d4e5a',
      eventType: 'parcel.created',
      version: 1,
      occurredAt: '2026-11-21T08:30:00.000Z',
      parcelId: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
      trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
      customerId: CUSTOMER.userId,
      merchantId: null,
      status: 'PENDING',
    };

    await consumer.handle(createdEvent);

    expect(channels[0].send).toHaveBeenCalledWith(
      CUSTOMER,
      expect.objectContaining({ template: 'parcel-booked' }),
    );
    expect(repository.record).toHaveBeenCalledWith({
      eventId: createdEvent.eventId,
      channel: 'EMAIL',
      recipientUserId: CUSTOMER.userId,
      template: 'parcel-booked',
      status: 'SENT',
      errorMessage: null,
    });
  });

  it('notifies customer and courier when ASSIGNED is in notifyStatuses', async () => {
    const customConfig = testWorkerConfig({
      notifications: {
        ...testWorkerConfig().notifications,
        notifyStatuses: new Set([...DEFAULT_NOTIFY_STATUSES, 'ASSIGNED']),
      },
    });
    const repository = {
      findRecipient: jest.fn().mockResolvedValue(CUSTOMER),
      alreadyHandled: jest.fn().mockResolvedValue(false),
      record: jest.fn().mockResolvedValue(undefined),
    };
    const channels = [channel('EMAIL'), channel('SMS')];
    const consumer = new NotificationConsumer(
      repository as unknown as NotificationRepository,
      channels,
      customConfig,
    );

    const assignedEvent: ParcelStatusChangedV1 = {
      ...EVENT,
      newStatus: 'ASSIGNED',
      courierId: 'courier-uuid-1',
    };

    await consumer.handle(assignedEvent);

    expect(channels[0].send).toHaveBeenCalledWith(
      CUSTOMER,
      expect.objectContaining({ template: 'parcel-assigned' }),
    );
    expect(repository.record).toHaveBeenCalledWith({
      eventId: assignedEvent.eventId,
      channel: 'EMAIL',
      recipientUserId: CUSTOMER.userId,
      template: 'parcel-assigned',
      status: 'SENT',
      errorMessage: null,
    });
    expect(repository.record).toHaveBeenCalledWith({
      eventId: assignedEvent.eventId,
      channel: 'IN_APP',
      recipientUserId: 'courier-uuid-1',
      template: 'courier_new_assignment',
      status: 'SENT',
      errorMessage: null,
    });
  });
});
