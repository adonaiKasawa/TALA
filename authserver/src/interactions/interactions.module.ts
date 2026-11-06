import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { KeysModule } from '../keys/keys.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { MfaModule } from '../mfa/mfa.module.js';
import { OidcModule } from '../oidc/oidc.module.js';
import { InteractionsController } from './interactions.controller.js';
import { ReviewController } from './review.controller.js';
import { PagesController } from './pages.controller.js';
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    KeysModule,
    AuditModule,
    CredentialsModule,
    MfaModule,
    OidcModule,
  ],
  providers: [],
  controllers: [InteractionsController, ReviewController, PagesController],
  exports: [],
})
export class InteractionsModule {}
