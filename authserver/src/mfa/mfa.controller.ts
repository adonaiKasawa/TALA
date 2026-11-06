import { Controller } from '@nestjs/common';
import { Post, Req, Body } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { checkCsrf } from '../security/http-security.js';
import { ConfigService } from '../config/config.service.js';
import { MfaService } from './mfa.service.js';
import { OidcService } from '../oidc/oidc.service.js';
const code = z.string().min(6).max(64);
@Controller('')
export class MfaController {
  constructor(
    private readonly config: ConfigService,
    private readonly mfa: MfaService,
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
  @Post('account/mfa/enroll') async enroll(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { user, payload } = await this.member(req);
    return this.mfa.enrollMfa(
      user,
      z.object({ password: z.string().max(128).optional() }).parse(body)
        .password,
      payload,
    );
  }
  @Post('account/mfa/confirm') async enable(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { user } = await this.member(req);
    return this.mfa.confirmMfa(user, z.object({ code }).parse(body).code);
  }
  @Post('account/mfa/disable') async disable(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { user, payload } = await this.member(req);
    const data = z
      .object({ password: z.string().max(128).optional(), code })
      .parse(body);
    return this.mfa.disableMfa(user, data.password, data.code, payload);
  }
  @Post('account/mfa/recovery-codes') async recoveryCodes(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { user, payload } = await this.member(req);
    const data = z
      .object({ password: z.string().max(128).optional(), code })
      .parse(body);
    return this.mfa.renewRecoveryCodes(user, data.password, data.code, payload);
  }
}
