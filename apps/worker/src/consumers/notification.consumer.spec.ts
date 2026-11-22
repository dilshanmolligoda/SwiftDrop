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
    findParcel: jest.fn().mockResolvedValue(null),
    findUserByPhone: jest.fn().mockResolvedValue(null),
    findUserById: jest.fn().mockResolvedValue(null),
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
      findParcel: jest.fn().mockResolvedValue(null),
      findUserById: jest.fn().mockResolvedValue(null),
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
      title: 'New delivery assigned',
      description: `New delivery assigned: ${assignedEvent.trackingNumber} added to today's deliveries.`,
      status: 'SENT',
      errorMessage: null,
    });
  });

  it('notifies customer when parcel is PICKED_UP', async () => {
    const { consumer, repository, channels } = setup();
    const pickedUpEvent: ParcelStatusChangedV1 = {
      ...EVENT,
      previousStatus: 'ASSIGNED',
      newStatus: 'PICKED_UP',
    };

    await consumer.handle(pickedUpEvent);

    expect(channels[0].send).toHaveBeenCalledWith(
      CUSTOMER,
      expect.objectContaining({
        template: 'parcel-picked-up',
        subject: `Parcel Picked Up — ${pickedUpEvent.trackingNumber}`,
      }),
    );
    expect(repository.record).toHaveBeenCalledWith({
      eventId: pickedUpEvent.eventId,
      channel: 'EMAIL',
      recipientUserId: CUSTOMER.userId,
      template: 'parcel-picked-up',
      status: 'SENT',
      errorMessage: null,
    });
  });

  it('records an IN_APP notification for customer when status is IN_TRANSIT', async () => {
    const { consumer, repository, channels } = setup();
    const inTransitEvent: ParcelStatusChangedV1 = {
      ...EVENT,
      previousStatus: 'PICKED_UP',
      newStatus: 'IN_TRANSIT',
    };

    await consumer.handle(inTransitEvent);

    // No email is sent for in-transit
    expect(channels[0].send).not.toHaveBeenCalled();
    // In-app notification is recorded
    expect(repository.record).toHaveBeenCalledWith({
      eventId: inTransitEvent.eventId,
      channel: 'IN_APP',
      recipientUserId: CUSTOMER.userId,
      template: 'parcel_in_transit',
      status: 'SENT',
      errorMessage: null,
    });
  });

  it('dispatches recipient SMS alert when parcel status changes to PICKED_UP (Scenario 15)', async () => {
    const { consumer, repository, channels } = setup();
    repository.findParcel.mockResolvedValue({
      id: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
      trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
      customerId: CUSTOMER.userId,
      senderName: 'Sender Bob',
      recipientName: 'Recipient Alice',
      recipientPhone: '+94771112233',
      recipientAddress: '123 Main St, Colombo',
    });
    const pickedUpEvent: ParcelStatusChangedV1 = {
      ...EVENT,
      newStatus: 'PICKED_UP',
      previousStatus: 'ASSIGNED',
    };

    await consumer.handle(pickedUpEvent);

    const smsChannel = channels.find((c) => c.channel === 'SMS');
    expect(smsChannel?.send).toHaveBeenCalled();
    const smsCalls = (smsChannel?.send as jest.Mock).mock.calls as Array<
      [{ to: string; message: string }]
    >;
    const recipientCall = smsCalls.find(
      (call) => call[0].to === '+94771112233',
    );
    expect(recipientCall).toBeDefined();
    expect(recipientCall?.[0].message).toContain(
      'Hello! Sender Bob has sent you a package via SwiftDrop',
    );

    const recordCalls = repository.record.mock.calls as Array<
      [
        {
          channel: string;
          template: string;
          title: string;
          description: string;
          status: string;
        },
      ]
    >;
    const recipientRecord = recordCalls.find(
      (call) =>
        call[0].channel === 'SMS' &&
        call[0].template === 'recipient_parcel_dispatched',
    );
    expect(recipientRecord).toBeDefined();
    expect(recipientRecord?.[0].description).toContain(
      'Hello! Sender Bob has sent you a package via SwiftDrop',
    );
    expect(recipientRecord?.[0].status).toBe('SENT');
  });

  it('dispatches recipient SMS alert when parcel status changes to OUT_FOR_DELIVERY (Scenario 16)', async () => {
    const { consumer, repository, channels } = setup();
    repository.findParcel.mockResolvedValue({
      id: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
      trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
      customerId: CUSTOMER.userId,
      senderName: 'Sender Bob',
      recipientName: 'Recipient Alice',
      recipientPhone: '+94771112233',
      recipientAddress: '123 Main St, Colombo',
    });

    await consumer.handle(EVENT); // EVENT has newStatus: 'OUT_FOR_DELIVERY'

    const smsChannel = channels.find((c) => c.channel === 'SMS');
    const smsCalls = (smsChannel?.send as jest.Mock).mock.calls as Array<
      [{ to: string; message: string }]
    >;
    const recipientCall = smsCalls.find(
      (call) => call[0].to === '+94771112233',
    );
    expect(recipientCall).toBeDefined();
    expect(recipientCall?.[0].message).toBe(
      `SwiftDrop Alert: Your package ${EVENT.trackingNumber} is out for delivery today to your address. Please ensure someone is available.`,
    );

    const recordCalls = repository.record.mock.calls as Array<
      [
        {
          channel: string;
          template: string;
          title: string;
          description: string;
          status: string;
        },
      ]
    >;
    const recipientRecord = recordCalls.find(
      (call) =>
        call[0].channel === 'SMS' &&
        call[0].template === 'recipient_out_for_delivery',
    );
    expect(recipientRecord).toBeDefined();
    expect(recipientRecord?.[0].title).toBe('Out for delivery today');
    expect(recipientRecord?.[0].status).toBe('SENT');
  });

  it('dispatches recipient SMS alert when parcel status changes to DELIVERED (Scenario 17)', async () => {
    const { consumer, repository, channels } = setup();
    repository.findParcel.mockResolvedValue({
      id: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
      trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
      customerId: CUSTOMER.userId,
      senderName: 'Sender Bob',
      recipientName: 'Recipient Alice',
      recipientPhone: '+94771112233',
      recipientAddress: '123 Main St, Colombo',
    });
    const deliveredEvent: ParcelStatusChangedV1 = {
      ...EVENT,
      newStatus: 'DELIVERED',
      previousStatus: 'OUT_FOR_DELIVERY',
    };

    await consumer.handle(deliveredEvent);

    const smsChannel = channels.find((c) => c.channel === 'SMS');
    const smsCalls = (smsChannel?.send as jest.Mock).mock.calls as Array<
      [{ to: string; message: string }]
    >;
    const recipientCall = smsCalls.find(
      (call) => call[0].to === '+94771112233',
    );
    expect(recipientCall).toBeDefined();
    expect(recipientCall?.[0].message).toBe(
      `SwiftDrop: Package ${deliveredEvent.trackingNumber} was successfully delivered. Thank you for choosing SwiftDrop!`,
    );

    const recordCalls = repository.record.mock.calls as Array<
      [
        {
          channel: string;
          template: string;
          title: string;
          description: string;
          status: string;
        },
      ]
    >;
    const recipientRecord = recordCalls.find(
      (call) =>
        call[0].channel === 'SMS' && call[0].template === 'recipient_delivered',
    );
    expect(recipientRecord).toBeDefined();
    expect(recipientRecord?.[0].title).toBe('Package delivered');
    expect(recipientRecord?.[0].status).toBe('SENT');
  });

  it('dispatches recipient missed delivery SMS alert when status changes to FAILED with RECIPIENT_UNAVAILABLE (Scenario 18)', async () => {
    const { consumer, repository, channels } = setup();
    repository.findParcel.mockResolvedValue({
      id: '0b6a3f0e-7d2c-4f1a-8e9b-1c2d3e4f5a6b',
      trackingNumber: 'SD-0123456789ABCDEF0123456789ABCDEF',
      customerId: CUSTOMER.userId,
      senderName: 'Sender Bob',
      recipientName: 'Recipient Alice',
      recipientPhone: '+94771112233',
      recipientAddress: '123 Main St, Colombo',
    });
    const failedEvent: ParcelStatusChangedV1 = {
      ...EVENT,
      newStatus: 'FAILED',
      failureReason: 'RECIPIENT_UNAVAILABLE',
      previousStatus: 'OUT_FOR_DELIVERY',
    };

    await consumer.handle(failedEvent);

    const smsChannel = channels.find((c) => c.channel === 'SMS');
    const smsCalls = (smsChannel?.send as jest.Mock).mock.calls as Array<
      [{ to: string; message: string }]
    >;
    const recipientCall = smsCalls.find(
      (call) => call[0].to === '+94771112233',
    );
    expect(recipientCall).toBeDefined();
    expect(recipientCall?.[0].message).toBe(
      `SwiftDrop missed you: We attempted delivery for parcel ${failedEvent.trackingNumber} but could not reach you. Our courier will re-attempt or contact customer support.`,
    );

    const recordCalls = repository.record.mock.calls as Array<
      [
        {
          channel: string;
          template: string;
          title: string;
          description: string;
          status: string;
        },
      ]
    >;
    const recipientRecord = recordCalls.find(
      (call) =>
        call[0].channel === 'SMS' &&
        call[0].template === 'recipient_delivery_attempt_failed',
    );
    expect(recipientRecord).toBeDefined();
    expect(recipientRecord?.[0].title).toBe('Missed delivery attempt');
    expect(recipientRecord?.[0].status).toBe('SENT');
  });

  it('sends in-app notification and SMS to courier when parcel is ASSIGNED', async () => {
    const { consumer, repository, channels } = setup();
    repository.findUserById.mockResolvedValue({
      id: 'courier-uuid-1',
      fullName: 'Kamal Courier',
      phoneNumber: '+94719876543',
    });

    const assignedEvent: ParcelStatusChangedV1 = {
      ...EVENT,
      newStatus: 'ASSIGNED',
      courierId: 'courier-uuid-1',
    };

    await consumer.handle(assignedEvent);

    const smsChannel = channels.find((c) => c.channel === 'SMS');
    const smsCalls = (smsChannel?.send as jest.Mock).mock.calls as Array<
      [{ to: string; message: string }]
    >;
    const courierSmsCall = smsCalls.find(
      (call) => call[0].to === '+94719876543',
    );
    expect(courierSmsCall).toBeDefined();
    expect(courierSmsCall?.[0].message).toBe(
      `SwiftDrop: New delivery assigned: ${assignedEvent.trackingNumber} added to today's deliveries.`,
    );

    const recordCalls = repository.record.mock.calls as Array<
      [
        {
          recipientUserId: string;
          channel: string;
          template: string;
          title?: string;
          description?: string;
        },
      ]
    >;
    const inAppRecord = recordCalls.find(
      (c) =>
        c[0].channel === 'IN_APP' &&
        c[0].recipientUserId === 'courier-uuid-1' &&
        c[0].template === 'courier_new_assignment',
    );
    expect(inAppRecord).toBeDefined();
    expect(inAppRecord?.[0].title).toBe('New delivery assigned');

    const smsRecord = recordCalls.find(
      (c) =>
        c[0].channel === 'SMS' &&
        c[0].recipientUserId === 'courier-uuid-1' &&
        c[0].template === 'courier_new_assignment',
    );
    expect(smsRecord).toBeDefined();
    expect(smsRecord?.[0].title).toBe('New delivery assigned');
  });
});
