import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { KeysModule } from '../keys/keys.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { OidcService } from './oidc.service.js';
@Module({
  imports: [ConfigModule, DatabaseModule, KeysModule, AuditModule],
  providers: [OidcService],
  controllers: [],
  exports: [OidcService],
})
export class OidcModule {}
