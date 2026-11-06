import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { Database } from './database.service.js';
import { CleanupService } from './cleanup.service.js';

@Module({
  imports: [ConfigModule],
  providers: [Database, CleanupService],
  exports: [Database, CleanupService],
})
export class DatabaseModule {}
