import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { KeysModule } from '../keys/keys.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { OidcModule } from '../oidc/oidc.module.js';
import { SessionsService } from './sessions.service.js';
import { SessionsController } from './sessions.controller.js';
@Module({
  imports: [ConfigModule, DatabaseModule, KeysModule, AuditModule, OidcModule],
  providers: [SessionsService],
  controllers: [SessionsController],
  exports: [SessionsService],
})
export class SessionsModule {}
