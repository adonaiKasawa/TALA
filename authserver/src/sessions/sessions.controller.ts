import { Controller } from '@nestjs/common';
import {
  Get,
  Post,
  Delete,
  Param,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { checkCsrf } from '../security/http-security.js';
import { ConfigService } from '../config/config.service.js';
import { Database } from '../database/database.service.js';
import { KeysService } from '../keys/keys.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionsService } from './sessions.service.js';
import { OidcService } from '../oidc/oidc.service.js';

@Controller('')
export class SessionsController {
  constructor(
    private readonly config: ConfigService,
    private readonly db: Database,
    private readonly keys: KeysService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    private readonly oidc: OidcService,
  ) {}
  private check(req: Request) {
    checkCsrf(req, this.config.value);
  }
  private async member(req: Request, admin = false) {
    if (
      !req.headers.authorization?.startsWith('Bearer ') &&
      !['GET', 'HEAD'].includes(req.method)
    )
      this.check(req);
    return this.oidc.authenticate(req, admin);
  }
  @Get('account/sessions') async listSessions(@Req() req: Request) {
    const { user, payload } = await this.member(req);
    return this.sessions.sessions(user.id, String(payload.sid));
  }
  @Delete('account/sessions/:id') async revoke(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.sessions.revokeSession((await this.member(req)).user.id, id);
  }
  @Post('account/sessions/revoke-all') async revokeAll(@Req() req: Request) {
    const { user } = await this.member(req);
    await this.sessions.revokeUser(user.id);
    await this.audit.record('sessions.revoked_all', user.id);
    return { message: 'Sessions révoquées.' };
  }
  @Get('account/grants') async grants(@Req() req: Request) {
    const { user } = await this.member(req);
    const rows = await this.db.oidcArtifact.findMany({
      where: { model: 'Grant', accountId: user.id },
    });
    return rows.map((r) => ({
      id: r.id,
      clientId: this.keys.open<{ clientId?: string }>(r.payload).clientId,
      expiresAt: r.expiresAt,
    }));
  }
  @Delete('account/grants/:id') async revokeGrant(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const { user } = await this.member(req);
    const grant = await this.db.oidcArtifact.findFirst({
      where: { model: 'Grant', id, accountId: user.id },
    });
    if (!grant) throw new BadRequestException();
    await this.db.oidcArtifact.deleteMany({
      where: { OR: [{ model: 'Grant', id }, { grantId: id }] },
    });
    return { message: 'Autorisation révoquée.' };
  }
}
