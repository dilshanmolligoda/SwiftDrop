import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { renderPage } from './page.js';
import { verifySwiftDropSignature } from './signature.js';
import {
  isDuplicate,
  publicState,
  recordOrder,
  recordWebhook,
  settings,
  type WebhookResult,
} from './store.js';

const PORT = Number(process.env.MOCK_MERCHANT_PORT ?? 5000);
const MAX_BODY_BYTES = 1_000_000;
const API_TIMEOUT_MS = 10_000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500)
      console.error('[mock-merchant] unexpected error', error);
    sendJson(res, status, {
      error: error instanceof HttpError ? error.message : 'Internal error',
    });
  });
}).listen(PORT, () => {
  console.log(`[mock-merchant] store running on http://localhost:${PORT}`);
});

async function handle(req: IncomingMessage, res: ServerResponse) {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  switch (`${req.method} ${pathname}`) {
    case 'GET /':
      return sendHtml(res, renderPage());
    case 'GET /state':
      return sendJson(res, 200, publicState());
    case 'POST /settings':
      return updateSettings(req, res);
    case 'POST /orders':
      return createOrder(req, res);
    case 'POST /webhooks/swiftdrop':
      return receiveWebhook(req, res);
    default:
      throw new HttpError(404, 'Not found');
  }
}

/** SwiftDrop calls this on every status change of one of our parcels. */
async function receiveWebhook(req: IncomingMessage, res: ServerResponse) {
  const rawBody = await readBody(req);
  const eventId = header(req, 'x-swiftdrop-event-id') ?? 'unknown';
  const payload = parseJson(rawBody);

  const reply = (status: number, result: WebhookResult) => {
    recordWebhook({
      receivedAt: new Date().toISOString(),
      eventId,
      result,
      respondedWith: status,
      payload,
    });
    console.log(`[mock-merchant] webhook ${eventId} → ${result} (${status})`);
    sendJson(res, status, { result });
  };

  // Simulates an outage so SwiftDrop's retries can be shown in the demo.
  if (settings.failMode) return reply(500, 'FAIL_MODE');

  const valid = verifySwiftDropSignature(
    settings.webhookSecret,
    header(req, 'x-swiftdrop-timestamp'),
    rawBody,
    header(req, 'x-swiftdrop-signature'),
  );
  if (!valid) return reply(401, 'BAD_SIGNATURE');

  // Deliveries are at-least-once: acknowledge repeats but process them once.
  if (isDuplicate(eventId)) return reply(200, 'DUPLICATE');

  return reply(200, 'ACCEPTED');
}

/** The store's checkout calling SwiftDrop to book a delivery. */
async function createOrder(req: IncomingMessage, res: ServerResponse) {
  if (!settings.apiKey) {
    throw new HttpError(400, 'Save a SwiftDrop API key in the settings first');
  }
  const order = parseJson(await readBody(req));
  if (typeof order !== 'object' || order === null) {
    throw new HttpError(400, 'Order must be a JSON object');
  }
  const merchantOrderRef =
    (order as { merchantOrderRef?: unknown }).merchantOrderRef?.toString() ??
    '';

  let status: number;
  let response: unknown;
  try {
    const apiResponse = await fetch(
      `${settings.apiBaseUrl}/merchant-api/orders`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': settings.apiKey,
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify(order),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      },
    );
    status = apiResponse.status;
    response = parseJson(await apiResponse.text());
  } catch {
    status = 502;
    response = { error: `Could not reach SwiftDrop at ${settings.apiBaseUrl}` };
  }

  recordOrder({
    sentAt: new Date().toISOString(),
    merchantOrderRef,
    status,
    response,
  });
  sendJson(res, status, response);
}

async function updateSettings(req: IncomingMessage, res: ServerResponse) {
  const body = parseJson(await readBody(req)) as Partial<
    Record<keyof typeof settings, unknown>
  >;
  if (typeof body.apiBaseUrl === 'string' && body.apiBaseUrl.trim()) {
    settings.apiBaseUrl = body.apiBaseUrl.trim().replace(/\/+$/, '');
  }
  // Empty strings keep the current value, so the page never has to resend secrets.
  if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    settings.apiKey = body.apiKey.trim();
  }
  if (typeof body.webhookSecret === 'string' && body.webhookSecret.trim()) {
    settings.webhookSecret = body.webhookSecret.trim();
  }
  if (typeof body.failMode === 'boolean') {
    settings.failMode = body.failMode;
  }
  sendJson(res, 200, publicState());
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, html: string) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
