import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RateLimitService } from './rate-limit.service.js';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class SecurityModule {}
