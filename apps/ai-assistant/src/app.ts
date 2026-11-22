import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { resolveUser as defaultResolveUser, type ChatUser } from './auth.js';
import { runChat as defaultRunChat, type ChatMessage } from './chat/agent.js';
import { config, llmEnabled as defaultLlmEnabled } from './config.js';

export const RATE_LIMIT_WINDOW_MS = 5 * 60_000;
export const RATE_LIMIT_MAX_MESSAGES = 20;

/** Injectable so tests can run without the real API or LLM. */
export interface AppDeps {
  resolveUser: (cookieHeader?: string) => Promise<ChatUser | null>;
  runChat: (user: ChatUser, messages: ChatMessage[]) => Promise<string>;
  llmEnabled: () => boolean;
  allowedOrigins: string[];
}

const chatBody = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(10),
});

/** In-memory fixed-window limiter. Protects the free LLM quota per user. */
function createRateLimiter(windowMs: number, max: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > max;
  };
}

export function createApp(overrides: Partial<AppDeps> = {}): Express {
  const deps: AppDeps = {
    resolveUser: defaultResolveUser,
    runChat: defaultRunChat,
    llmEnabled: defaultLlmEnabled,
    allowedOrigins: config.allowedOrigins,
    ...overrides,
  };
  const isRateLimited = createRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_MESSAGES);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));

  // CORS for local dev (web on :5173, assistant on :3100). In production the
  // widget calls /api/assistant on the same domain through Caddy.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && deps.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/assistant/health', (_req, res) => {
    res.json({ status: 'ok', llm: deps.llmEnabled() });
  });

  app.post('/api/assistant/chat', async (req, res) => {
    // CSRF protection: same rule as the API's CsrfGuard
    const origin = req.headers.origin;
    if (!origin || !deps.allowedOrigins.includes(origin)) {
      res.status(403).json({ reply: 'Request rejected.' });
      return;
    }

    if (!deps.llmEnabled()) {
      res.status(503).json({ reply: 'The assistant is not configured yet. Please try again later.' });
      return;
    }

    const user = await deps.resolveUser(req.headers.cookie);
    if (!user) {
      res.status(401).json({ reply: 'Please log in again to use the assistant.' });
      return;
    }

    const parsed = chatBody.safeParse(req.body);
    if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user') {
      res.status(400).json({ reply: 'Invalid message.' });
      return;
    }

    if (isRateLimited(user.token)) {
      res.status(429).json({ reply: 'You are sending messages too quickly. Please wait a few minutes.' });
      return;
    }

    try {
      const reply = await deps.runChat(user, parsed.data.messages);
      res.json({ reply });
    } catch (error) {
      // Never log the token or the user's messages
      console.error('chat failed:', error instanceof Error ? error.message : 'unknown error');
      res.status(502).json({ reply: 'Sorry, the assistant is having trouble right now. Please try again.' });
    }
  });

  // Malformed or too-large JSON bodies
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const tooLarge = (err as { type?: string } | null)?.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({ reply: 'Invalid request.' });
  });

  return app;
}
