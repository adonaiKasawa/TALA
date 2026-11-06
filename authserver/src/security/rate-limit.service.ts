import { Injectable, ForbiddenException } from '@nestjs/common';
import { Database } from '../database/database.service.js';
import { ConfigService } from '../config/config.service.js';
import { digest } from './crypto.js';

@Injectable()
export class RateLimitService {
  constructor(
    private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  async check(key: string, max = 10, seconds = 900) {
    const id = digest(`${this.config.value.NODE_ENV}:${key}`);
    const rows = await this.db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateBucket" ("key", "count", "expiresAt") VALUES (${id}, 1, NOW() + (${seconds} * INTERVAL '1 second'))
      ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "RateBucket"."expiresAt" < NOW() THEN 1 ELSE "RateBucket"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateBucket"."expiresAt" < NOW() THEN NOW() + (${seconds} * INTERVAL '1 second') ELSE "RateBucket"."expiresAt" END RETURNING "count"`;
    if (rows[0].count > max)
      throw new ForbiddenException('Trop de tentatives. Réessaie plus tard.');
  }
}
