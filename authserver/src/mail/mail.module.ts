import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { KeysModule } from '../keys/keys.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { MailService } from './mail.service.js';
@Module({
  imports: [ConfigModule, DatabaseModule, KeysModule, AuditModule],
  providers: [MailService],
  controllers: [],
  exports: [MailService],
})
export class MailModule {}
