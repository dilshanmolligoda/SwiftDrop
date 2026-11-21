import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  MessagingStatus,
  type MessagingState,
} from '../../infrastructure/messaging/messaging-status.js';

export type CheckStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'error';
  uptime: number;
  timestamp: string;
  checks: { database: CheckStatus; messaging: MessagingState };
  /**
   * Events waiting to be published to RabbitMQ. Informational: RabbitMQ being
   * down does not make the API unhealthy, because events wait in the outbox.
   */
  outbox: { pending: number | null; oldestPendingSeconds: number | null };
}

export interface DatabaseReport {
  database: string;
  version: string;
  size: string;
  tableCount: number;
  totalRows: number;
  tables: { name: string; rows: number }[];
  migrations: { applied: number; latest: string | null };
}

const MIGRATIONS_TABLE = '_prisma_migrations';

@Injectable()
export class HealthService implements OnModuleDestroy {
  // Small dedicated pool so health checks never compete with request traffic
  private readonly pool: Pool;

  constructor(
    config: ConfigService,
    @Optional() private readonly messaging?: MessagingStatus,
  ) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: 1,
      connectionTimeoutMillis: 2000,
    });
    // An idle client dropping (e.g. Postgres restart) must not crash the app
    this.pool.on('error', () => undefined);
  }

  async check(): Promise<HealthReport> {
    const database = await this.pingDatabase();
    return {
      status: database === 'up' ? 'ok' : 'error',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        database,
        messaging: this.messaging?.state() ?? 'disabled',
      },
      outbox:
        database === 'up'
          ? await this.outboxBacklog()
          : { pending: null, oldestPendingSeconds: null },
    };
  }

  // Exact row counts scan every table — fine for dev, too slow for the frequent /health probe
  async databaseDetails(): Promise<DatabaseReport> {
    const info = await this.pool.query<{
      database: string;
      version: string;
      size: string;
    }>(
      `SELECT current_database() AS database,
              current_setting('server_version') AS version,
              pg_size_pretty(pg_database_size(current_database())) AS size`,
    );

    const tableNames = await this.pool.query<{ name: string }>(
      `SELECT table_name AS name
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    );

    const tables: DatabaseReport['tables'] = [];
    let hasMigrationsTable = false;
    for (const { name } of tableNames.rows) {
      if (name === MIGRATIONS_TABLE) {
        hasMigrationsTable = true;
        continue;
      }
      const quoted = `"public"."${name.replace(/"/g, '""')}"`;
      const result = await this.pool.query<{ count: string }>(
        `SELECT count(*) AS count FROM ${quoted}`,
      );
      tables.push({ name, rows: Number(result.rows[0].count) });
    }

    return {
      ...info.rows[0],
      tableCount: tables.length,
      totalRows: tables.reduce((sum, t) => sum + t.rows, 0),
      tables,
      migrations: hasMigrationsTable
        ? await this.migrationInfo()
        : { applied: 0, latest: null },
    };
  }

  private async migrationInfo(): Promise<DatabaseReport['migrations']> {
    const result = await this.pool.query<{
      applied: string;
      latest: string | null;
    }>(
      `SELECT count(*) AS applied,
              (SELECT migration_name FROM ${MIGRATIONS_TABLE}
                WHERE finished_at IS NOT NULL
                ORDER BY finished_at DESC LIMIT 1) AS latest
         FROM ${MIGRATIONS_TABLE}
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    return {
      applied: Number(result.rows[0].applied),
      latest: result.rows[0].latest,
    };
  }

  private async outboxBacklog(): Promise<HealthReport['outbox']> {
    try {
      const result = await this.pool.query<{
        pending: string;
        oldest: string | null;
      }>(
        `SELECT count(*) AS pending,
                EXTRACT(EPOCH FROM now() - min("createdAt"))::int AS oldest
           FROM "outbox_events"
          WHERE "publishedAt" IS NULL`,
      );
      const row = result.rows[0];
      return {
        pending: Number(row.pending),
        oldestPendingSeconds: row.oldest === null ? null : Number(row.oldest),
      };
    } catch {
      // e.g. migration not applied yet
      return { pending: null, oldestPendingSeconds: null };
    }
  }

  private async pingDatabase(): Promise<CheckStatus> {
    try {
      await this.pool.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
