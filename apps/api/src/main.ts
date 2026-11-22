import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { cookieParserMiddleware } from './modules/auth/utils/cookie.util.js';
import {
  parseAllowedOrigins,
  RealtimeIoAdapter,
} from './modules/realtime/realtime-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Run onModuleDestroy hooks on SIGTERM/SIGINT (docker stop, Ctrl+C), so the
  // outbox relay finishes its batch and connections close cleanly.
  app.enableShutdownHooks();

  const prefix = config.get<string>('API_PREFIX', 'api');
  const version = config.get<string>('API_VERSION', '1');
  app.setGlobalPrefix(`${prefix}/v${version}`);

  app.use(cookieParserMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Comma-separated list, e.g. "http://localhost:5173,https://app.example.com"
  const allowedOrigins = parseAllowedOrigins(
    config.get<string>('CORS_ORIGINS', 'http://localhost:5173'),
  );

  // Live updates (Socket.IO at /api/v1/realtime) — same allowed origins.
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, allowedOrigins));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  await app.listen(config.get<number>('API_PORT', 4000));
}
void bootstrap();
