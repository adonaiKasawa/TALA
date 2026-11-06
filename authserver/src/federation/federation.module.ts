import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { KeysModule } from '../keys/keys.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SecurityModule } from '../security/security.module.js';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { MfaModule } from '../mfa/mfa.module.js';
import { OidcModule } from '../oidc/oidc.module.js';
import { FederationController } from './federation.controller.js';
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    KeysModule,
    AuditModule,
    SecurityModule,
    CredentialsModule,
    MfaModule,
    OidcModule,
  ],
  providers: [],
  controllers: [FederationController],
  exports: [],
})
export class FederationModule {}
