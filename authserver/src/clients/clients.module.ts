import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { KeysModule } from '../keys/keys.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { OidcModule } from '../oidc/oidc.module.js';
import { ClientsController } from './clients.controller.js';
@Module({
  imports: [ConfigModule, DatabaseModule, KeysModule, AuditModule, OidcModule],
  providers: [],
  controllers: [ClientsController],
  exports: [],
})
export class ClientsModule {}
