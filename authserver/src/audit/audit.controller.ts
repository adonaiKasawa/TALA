import { Controller } from '@nestjs/common';
import { Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { checkCsrf } from '../security/http-security.js';
import { ConfigService } from '../config/config.service.js';
import { Database } from '../database/database.service.js';
import { OidcService } from '../oidc/oidc.service.js';

@Controller('admin')
export class AuditController {
  constructor(
    private readonly config: ConfigService,
    private readonly db: Database,
    private readonly oidc: OidcService,
  ) {}
  private async admin(req: Request) {
    if (
      !req.headers.authorization?.startsWith('Bearer ') &&
      !['GET', 'HEAD'].includes(req.method)
    )
      checkCsrf(req, this.config.value);
    return this.oidc.authenticate(req, true);
  }
  @Get('audit') async audit(@Req() req: Request) {
    await this.admin(req);
    return this.db.auditEvent.findMany({
      take: 200,
      orderBy: { createdAt: 'desc' },
    });
  }
}
