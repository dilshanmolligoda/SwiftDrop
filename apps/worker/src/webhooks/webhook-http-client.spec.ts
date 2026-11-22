import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { postWebhook } from './webhook-http-client.js';

/** Real HTTP round-trips against a local server. */
describe('postWebhook', () => {
  let server: Server;
  let base: string;
  const received: { headers: Record<string, unknown>; body: string }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        switch (req.url) {
          case '/ok':
            res.writeHead(200).end('thanks');
            return;
          case '/error':
            res.writeHead(503).end();
            return;
          case '/redirect':
            res.writeHead(302, { Location: '/ok' }).end();
            return;
          case '/slow':
            setTimeout(() => res.writeHead(200).end(), 2000);
            return;
          default:
            res.writeHead(404).end();
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const send = (path: string, allowPrivate = true, timeoutMs = 1000) =>
    postWebhook({
      url: new URL(base + path),
      body: '{"hello":"merchant"}',
      headers: { 'X-SwiftDrop-Event-Id': 'evt-1' },
      timeoutMs,
      allowPrivate,
    });

  it('POSTs the body and headers and reports the status', async () => {
    const result = await send('/ok');
    expect(result).toMatchObject({ kind: 'response', statusCode: 200 });
    const last = received[received.length - 1];
    expect(last.body).toBe('{"hello":"merchant"}');
    expect(last.headers['x-swiftdrop-event-id']).toBe('evt-1');
    expect(last.headers['content-type']).toBe('application/json');
    expect(last.headers['user-agent']).toBe('SwiftDrop-Webhooks/1.0');
  });

  it('reports error statuses without throwing', async () => {
    await expect(send('/error')).resolves.toMatchObject({ statusCode: 503 });
  });

  it('does not follow redirects', async () => {
    await expect(send('/redirect')).resolves.toMatchObject({ statusCode: 302 });
  });

  it('times out as a network error', async () => {
    await expect(send('/slow', true, 200)).resolves.toMatchObject({
      kind: 'network-error',
      error: 'timed out',
    });
  });

  it('reports a refused connection as a network error', async () => {
    const result = await postWebhook({
      url: new URL('http://127.0.0.1:1/'),
      body: '{}',
      headers: {},
      timeoutMs: 1000,
      allowPrivate: true,
    });
    expect(result.kind).toBe('network-error');
  });

  it('blocks private IP literals unless allowed, without connecting', async () => {
    const before = received.length;
    await expect(send('/ok', false)).resolves.toMatchObject({
      kind: 'blocked',
    });
    expect(received.length).toBe(before);
  });

  it('blocks hostnames that resolve to a private address', async () => {
    const before = received.length;
    const port = (server.address() as AddressInfo).port;
    const result = await postWebhook({
      url: new URL(`http://localhost:${port}/ok`),
      body: '{}',
      headers: {},
      timeoutMs: 1000,
      allowPrivate: false,
    });
    expect(result).toMatchObject({ kind: 'blocked' });
    expect(received.length).toBe(before);
  });
});
