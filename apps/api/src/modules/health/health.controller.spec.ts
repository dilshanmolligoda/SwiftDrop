import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { DatabaseReport, HealthReport, HealthService } from './health.service';

const report = (database: 'up' | 'down'): HealthReport => ({
  status: database === 'up' ? 'ok' : 'error',
  uptime: 1,
  timestamp: new Date().toISOString(),
  checks: { database },
});

const dbReport: DatabaseReport = {
  database: 'swiftdrop',
  version: '16.0',
  size: '8 MB',
  tableCount: 1,
  totalRows: 3,
  tables: [{ name: 'User', rows: 3 }],
  migrations: { applied: 1, latest: 'init' },
};

describe('HealthController', () => {
  let controller: HealthController;
  const healthService = { check: jest.fn(), databaseDetails: jest.fn() };
  const env: Record<string, string> = {};

  beforeEach(async () => {
    delete env.NODE_ENV;
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: healthService },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] },
        },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('returns the report when the database is up', async () => {
    healthService.check.mockResolvedValue(report('up'));
    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('responds 503 when the database is down', async () => {
    healthService.check.mockResolvedValue(report('down'));
    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns table and row counts outside production', async () => {
    healthService.databaseDetails.mockResolvedValue(dbReport);
    await expect(controller.database()).resolves.toEqual(dbReport);
  });

  it('hides database details in production', async () => {
    env.NODE_ENV = 'production';
    await expect(controller.database()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('responds 503 when database details cannot be read', async () => {
    healthService.databaseDetails.mockRejectedValue(new Error('down'));
    await expect(controller.database()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
