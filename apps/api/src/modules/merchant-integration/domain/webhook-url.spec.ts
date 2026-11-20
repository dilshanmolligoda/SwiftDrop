import { checkWebhookUrl } from './webhook-url.js';

describe('checkWebhookUrl', () => {
  describe('production (allowLocal: false)', () => {
    const check = (url: string) => checkWebhookUrl(url, { allowLocal: false });

    it('accepts a public https URL and drops the fragment', () => {
      expect(check(' https://shop.example.com/hooks/swiftdrop#x ')).toEqual({
        ok: true,
        url: 'https://shop.example.com/hooks/swiftdrop',
      });
    });

    it.each([
      'http://shop.example.com/hook',
      'https://localhost/hook',
      'https://127.0.0.1/hook',
      'https://10.0.0.5/hook',
      'https://192.168.1.10/hook',
      'https://172.20.0.3/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/hook',
      'https://printer.local/hook',
    ])('rejects %s', (url) => {
      expect(check(url).ok).toBe(false);
    });
  });

  describe('local development (allowLocal: true)', () => {
    const check = (url: string) => checkWebhookUrl(url, { allowLocal: true });

    it('accepts the mock merchant store on localhost over http', () => {
      expect(check('http://localhost:5000/webhooks/swiftdrop')).toEqual({
        ok: true,
        url: 'http://localhost:5000/webhooks/swiftdrop',
      });
    });
  });

  it.each([
    ['', 'Webhook URL is required'],
    ['not a url', 'Webhook URL is not a valid URL'],
    ['ftp://shop.example.com/hook', 'Webhook URL must start with https://'],
    [
      'https://user:pass@shop.example.com/hook',
      'Webhook URL must not contain a username or password',
    ],
    [`https://shop.example.com/${'a'.repeat(2050)}`, 'Webhook URL is too long'],
  ])('rejects %p with a clear reason', (url, reason) => {
    expect(checkWebhookUrl(url, { allowLocal: true })).toEqual({
      ok: false,
      reason,
    });
  });
});
