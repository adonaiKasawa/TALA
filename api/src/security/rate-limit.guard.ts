import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { Database } from '../database/database.service.js';
import { ConfigService } from '../config/config.service.js';

@Injectable()
export class RateLimitGuard
  implements CanActivate, OnModuleInit, OnModuleDestroy
{
  private cleanup?: ReturnType<typeof setInterval>;
  constructor(
    private readonly db: Database,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    this.cleanup = setInterval(() => {
      void this.db.rateBucket
        .deleteMany({ where: { expiresAt: { lt: new Date() } } })
        .catch(() => {});
    }, 60000);
    this.cleanup.unref();
  }
  onModuleDestroy() {
    clearInterval(this.cleanup);
  }
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.path.endsWith('/health/live') || req.path.endsWith('/health/ready'))
      return true;
    const writing = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const upload =
      req.method === 'PUT' &&
      /^\/api\/v1\/videos\/[a-f0-9-]{36}\/content$/i.test(req.path);
    const watch = writing && /^\/api\/v1\/watch\//.test(req.path);
    const max = watch ? 240 : upload ? 200 : writing ? 30 : 200;
    const key = createHash('sha256')
      .update(
        `${this.config.value.NODE_ENV}:${watch ? 'watch' : upload ? 'upload' : writing ? 'write' : 'read'}:${req.ip}`,
      )
      .digest('hex');
    const rows = await this.db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateBucket" ("key", "count", "expiresAt") VALUES (${key}, 1, (NOW() AT TIME ZONE 'UTC') + INTERVAL '1 minute')
      ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "RateBucket"."expiresAt" < (NOW() AT TIME ZONE 'UTC') THEN 1 ELSE "RateBucket"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateBucket"."expiresAt" < (NOW() AT TIME ZONE 'UTC') THEN (NOW() AT TIME ZONE 'UTC') + INTERVAL '1 minute' ELSE "RateBucket"."expiresAt" END RETURNING "count"`;
    if (rows[0].count > max)
      throw new HttpException(
        'Trop de requetes. Reessaie dans une minute.',
        429,
      );
    return true;
  }
}
