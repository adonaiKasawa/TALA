import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { KeysModule } from '../keys/keys.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { OidcModule } from '../oidc/oidc.module.js';
import { MfaService } from './mfa.service.js';
import { MfaController } from './mfa.controller.js';
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    KeysModule,
    AuditModule,
    CredentialsModule,
    SessionsModule,
    OidcModule,
  ],
  providers: [MfaService],
  controllers: [MfaController],
  exports: [MfaService],
})
export class MfaModule {}
