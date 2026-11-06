import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.metadata.js';
import { Database } from '../database/database.service.js';
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly db: Database) {}
  @Get('live') live() {
    return { status: 'ok', service: 'tala-api' };
  }
  @Get('ready') async ready() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
