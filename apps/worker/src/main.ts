import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  // No HTTP API: a standalone application context running RabbitMQ consumers.
  const app = await NestFactory.createApplicationContext(WorkerModule);
  // SIGTERM (docker stop) → stop consuming, finish in-flight messages, close.
  app.enableShutdownHooks();
  await app.init();
  new Logger('Worker').log('Worker started');
}

bootstrap().catch((error: unknown) => {
  new Logger('Worker').error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
