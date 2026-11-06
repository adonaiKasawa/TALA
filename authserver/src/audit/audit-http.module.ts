import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { OidcModule } from '../oidc/oidc.module.js';
import { AuditController } from './audit.controller.js';
@Module({
  imports: [ConfigModule, DatabaseModule, OidcModule],
  providers: [],
  controllers: [AuditController],
  exports: [],
})
export class AuditHttpModule {}
