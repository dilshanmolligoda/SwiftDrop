import { createServer, type Server } from 'node:http';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker.config.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { RabbitMqConnection } from '../messaging/rabbitmq.connection.js';

export interface WorkerHealth {
  status: 'ok' | 'error';
  uptime: number;
  checks: { database: 'up' | 'down'; messaging: 'up' | 'down' };
}

/**
 * Tiny internal HTTP endpoint for Docker / Kubernetes probes:
 * `GET /health` → 200 when the worker can reach Postgres and RabbitMQ, else 503.
 * Not published outside the container network.
 */
@Injectable()
export class HealthServer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HealthServer.name);
  private server?: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqConnection,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  async check(): Promise<WorkerHealth> {
    const database = (await this.prisma.ping()) ? 'up' : 'down';
    const messaging = this.rabbit.isConnected() ? 'up' : 'down';
    return {
      status: database === 'up' && messaging === 'up' ? 'ok' : 'error',
      uptime: Math.round(process.uptime()),
      checks: { database, messaging },
    };
  }

  onApplicationBootstrap(): void {
    this.server = createServer((req, res) => {
      if (req.method !== 'GET' || req.url !== '/health') {
        res.writeHead(404).end();
        return;
      }
      void this.check().then(
        (health) => {
          res
            .writeHead(health.status === 'ok' ? 200 : 503, {
              'Content-Type': 'application/json',
            })
            .end(JSON.stringify(health));
        },
        () => res.writeHead(503).end(),
      );
    });
    this.server.listen(this.config.healthPort, () =>
      this.logger.log(`Health check on :${this.config.healthPort}/health`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }
}
