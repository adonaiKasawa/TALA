import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { KeysModule } from '../keys/keys.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SecurityModule } from '../security/security.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { OidcModule } from '../oidc/oidc.module.js';
import { CredentialsService } from './credentials.service.js';
import { CredentialsController } from './credentials.controller.js';
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    KeysModule,
    AuditModule,
    SecurityModule,
    SessionsModule,
    OidcModule,
  ],
  providers: [CredentialsService],
  controllers: [CredentialsController],
  exports: [CredentialsService],
})
export class CredentialsModule {}
