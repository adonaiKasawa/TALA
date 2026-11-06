import { Controller } from '@nestjs/common';
import { Get } from '@nestjs/common';
import { Database } from '../database/database.service.js';

@Controller('')
export class HealthController {
  constructor(private readonly db: Database) {}
  @Get('health/live') live() {
    return { status: 'ok', service: 'tala-authserver' };
  }
  @Get('health/ready') async ready() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
