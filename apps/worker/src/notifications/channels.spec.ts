import nodemailer from 'nodemailer';
import { testWorkerConfig } from '../testing/worker-config.fixture.js';
import { EmailChannel } from './email.channel.js';
import { MockSmsChannel } from './mock-sms.channel.js';
import {
  maskEmail,
  maskPhone,
  type Recipient,
  type RenderedNotification,
} from './notification-channel.js';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));
const createTransport = nodemailer.createTransport as unknown as jest.Mock;

const RECIPIENT: Recipient = {
  userId: 'u1',
  fullName: 'Nimal Perera',
  email: 'nimal@example.com',
  phoneNumber: '+94 77 123 4567',
};
const MESSAGE: RenderedNotification = {
  template: 'parcel-delivered',
  subject: 'Your parcel has been delivered',
  text: 'text',
  html: '<p>html</p>',
  sms: 'SwiftDrop: delivered.',
};

describe('EmailChannel', () => {
  const sendMail = jest.fn();
  beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockReset().mockReturnValue({ sendMail, close: jest.fn() });
  });

  it('sends through SMTP with the configured sender', async () => {
    sendMail.mockResolvedValue({ messageId: 'm1' });
    const email = new EmailChannel(testWorkerConfig());

    await expect(email.send(RECIPIENT, MESSAGE)).resolves.toEqual({
      status: 'SENT',
    });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', port: 1025, secure: false }),
    );
    expect(sendMail).toHaveBeenCalledWith({
      from: 'SwiftDrop <no-reply@swiftdrop.local>',
      to: { name: 'Nimal Perera', address: 'nimal@example.com' },
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  it('treats an SMTP 5xx for the recipient as permanent', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error('mailbox unavailable'), { responseCode: 550 }),
    );
    await expect(
      new EmailChannel(testWorkerConfig()).send(RECIPIENT, MESSAGE),
    ).resolves.toEqual({ status: 'FAILED', reason: 'SMTP 550' });
  });

  it('throws temporary problems so they are retried', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ESOCKET' }),
    );
    await expect(
      new EmailChannel(testWorkerConfig()).send(RECIPIENT, MESSAGE),
    ).rejects.toThrow('ECONNREFUSED');

    sendMail.mockRejectedValue(
      Object.assign(new Error('try later'), { responseCode: 451 }),
    );
    await expect(
      new EmailChannel(testWorkerConfig()).send(RECIPIENT, MESSAGE),
    ).rejects.toThrow('try later');
  });

  it('skips when email is disabled or there is no address', async () => {
    const disabled = new EmailChannel(
      testWorkerConfig({
        notifications: {
          email: { ...testWorkerConfig().notifications.email, enabled: false },
        },
      }),
    );
    await expect(disabled.send(RECIPIENT, MESSAGE)).resolves.toMatchObject({
      status: 'SKIPPED',
    });
    await expect(
      new EmailChannel(testWorkerConfig()).send(
        { ...RECIPIENT, email: null },
        MESSAGE,
      ),
    ).resolves.toMatchObject({ status: 'SKIPPED' });
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('MockSmsChannel', () => {
  it('reports SENT when there is a phone number', async () => {
    await expect(
      new MockSmsChannel(testWorkerConfig()).send(RECIPIENT, MESSAGE),
    ).resolves.toEqual({ status: 'SENT' });
  });

  it('skips without a phone number or when SMS is off', async () => {
    await expect(
      new MockSmsChannel(testWorkerConfig()).send(
        { ...RECIPIENT, phoneNumber: null },
        MESSAGE,
      ),
    ).resolves.toMatchObject({ status: 'SKIPPED' });
    await expect(
      new MockSmsChannel(
        testWorkerConfig({ notifications: { smsProvider: 'none' } }),
      ).send(RECIPIENT, MESSAGE),
    ).resolves.toMatchObject({ status: 'SKIPPED' });
  });
});

describe('masking for logs', () => {
  it('hides most of the address and number', () => {
    expect(maskEmail('nimal@example.com')).toBe('n***@example.com');
    expect(maskPhone('+94 77 123 4567')).toBe('******4567');
  });
});
