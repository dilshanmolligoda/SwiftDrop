import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { cookieParserMiddleware } from './modules/auth/utils/cookie.util.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

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
  const origins = config.get<string>('CORS_ORIGINS', 'http://localhost:5173');
  const allowedOrigins = origins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  await app.listen(config.get<number>('API_PORT', 4000));
}
void bootstrap();
