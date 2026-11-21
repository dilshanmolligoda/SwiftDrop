import {
  Controller,
  Get,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseReport, HealthReport, HealthService } from './health.service';
import { Public } from '../auth/decorators/public.decorator.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly config: ConfigService,
  ) {}

  // 200 when all dependencies are up, 503 otherwise (used by the Docker/K8s healthcheck)
  @Get()
  async check(): Promise<HealthReport> {
    const report = await this.healthService.check();
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }

  // Dev-only: table names and row counts would reveal too much in production
  @Get('db')
  async database(): Promise<DatabaseReport> {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException();
    }
    try {
      return await this.healthService.databaseDetails();
    } catch {
      throw new ServiceUnavailableException({ database: 'down' });
    }
  }
}
