import { Module } from '@nestjs/common';
import { SecurityModule } from './security/security.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { CredentialsModule } from './credentials/credentials.module.js';
import { MfaModule } from './mfa/mfa.module.js';
import { OidcModule } from './oidc/oidc.module.js';
import { InteractionsModule } from './interactions/interactions.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { FederationModule } from './federation/federation.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { KeysModule } from './keys/keys.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuditHttpModule } from './audit/audit-http.module.js';
import { HealthModule } from './health/health.module.js';
import { DocumentationModule } from './documentation/documentation.module.js';
import { MailModule } from './mail/mail.module.js';
@Module({
  imports: [
    SecurityModule,
    IdentityModule,
    CredentialsModule,
    MfaModule,
    OidcModule,
    InteractionsModule,
    ClientsModule,
    FederationModule,
    SessionsModule,
    KeysModule,
    AuditModule,
    AuditHttpModule,
    HealthModule,
    DocumentationModule,
    MailModule,
  ],
})
export class AppModule {}
