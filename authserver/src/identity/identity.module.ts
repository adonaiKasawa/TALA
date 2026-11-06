import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { KeysModule } from '../keys/keys.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { OidcModule } from '../oidc/oidc.module.js';
import { IdentityService } from './identity.service.js';
import { IdentityController } from './identity.controller.js';
import { AdminUsersController } from './admin-users.controller.js';
import { LifecycleController } from './lifecycle.controller.js';
import { PhoneController } from './phone.controller.js';
import { PhoneService } from './phone.service.js';
import { StepUpController } from './step-up.controller.js';
import { MfaModule } from '../mfa/mfa.module.js';
import { SecurityModule } from '../security/security.module.js';
@Module({
  imports: [
    ConfigModule,
    MfaModule,
    SecurityModule,
    DatabaseModule,
    KeysModule,
    AuditModule,
    CredentialsModule,
    SessionsModule,
    OidcModule,
  ],
  providers: [IdentityService, PhoneService],
  controllers: [
    IdentityController,
    AdminUsersController,
    LifecycleController,
    PhoneController,
    StepUpController,
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
