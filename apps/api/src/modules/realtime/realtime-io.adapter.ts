import type { IncomingMessage } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { REALTIME_SOCKET_PATH } from '@swiftdrop/contracts';
import type { ServerOptions } from 'socket.io';

/** Largest message a client may send (subscribe requests are tiny). */
const MAX_CLIENT_MESSAGE_BYTES = 4 * 1024;

/**
 * Socket.IO server settings for the realtime gateway.
 *
 * CORS does not protect WebSocket upgrades, and the socket authenticates with
 * the same cookie as REST — so the `Origin` header is checked here against
 * CORS_ORIGINS, like CsrfGuard does for state-changing HTTP requests. Requests
 * without an Origin (non-browser clients) can't carry a victim's cookie
 * cross-site, so they are allowed.
 */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: readonly string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const allowed = new Set(this.allowedOrigins);
    return super.createIOServer(port, {
      ...options,
      path: REALTIME_SOCKET_PATH,
      serveClient: false,
      // WebSocket only: no long-polling, so no sticky sessions are needed
      // behind a load balancer with several API instances.
      transports: ['websocket'],
      maxHttpBufferSize: MAX_CLIENT_MESSAGE_BYTES,
      cors: { origin: [...allowed], credentials: true },
      allowRequest: (
        req: IncomingMessage,
        callback: (err: string | null | undefined, success: boolean) => void,
      ) => {
        const origin = req.headers.origin;
        callback(null, origin === undefined || allowed.has(origin));
      },
    });
  }
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
