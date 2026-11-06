import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '../config/config.module.js';
import { AccessTokenService } from './access-token.service.js';
import { AccessGuard } from './access.guard.js';
import { DatabaseModule } from '../database/database.module.js';
import { RateLimitGuard } from '../security/rate-limit.guard.js';
import { IdentitySyncService } from './identity-sync.service.js';
@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [
    AccessTokenService,
    IdentitySyncService,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [IdentitySyncService],
})
export class AuthModule {}
