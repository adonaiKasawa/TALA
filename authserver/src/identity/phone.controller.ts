import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PhoneService } from './phone.service.js';
import { OidcService } from '../oidc/oidc.service.js';
import { CredentialsService } from '../credentials/credentials.service.js';
import { MfaService } from '../mfa/mfa.service.js';
import { ConfigService } from '../config/config.service.js';
import { checkCsrf } from '../security/http-security.js';
import { AuditService } from '../audit/audit.service.js';
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
const proof = z.object({
  password: z.string().max(128).optional(),
  mfaCode: z.string().max(64).optional(),
});
@Controller()
export class PhoneController {
  constructor(
    private readonly service: PhoneService,
    private readonly oidc: OidcService,
    private readonly credentials: CredentialsService,
    private readonly mfa: MfaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}
  private async member(req: Request, data: z.infer<typeof proof>) {
    if (!req.headers.authorization?.startsWith('Bearer '))
      checkCsrf(req, this.config.value);
    const { user, payload } = await this.oidc.authenticate(req);
    await this.credentials.recent(user, data.password, payload);
    if (user.mfaEnabled) await this.mfa.checkMfa(user, data.mfaCode || '');
    return user;
  }
  @Post('account/phone/challenge') async start(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const d = proof.extend({ phone }).strict().parse(body);
    const u = await this.member(req, d);
    return this.service.start(u.id, d.phone, 'link', req.ip || '');
  }
  @Put('account/phone') async link(@Req() req: Request, @Body() body: unknown) {
    if (!req.headers.authorization?.startsWith('Bearer '))
      checkCsrf(req, this.config.value);
    const { user } = await this.oidc.authenticate(req);
    const d = z
      .object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) })
      .strict()
      .parse(body);
    await this.service.consume(d.challengeId, d.code, 'link', user.id, true);
    await this.audit.record('phone.linked', user.id);
    return { linked: true };
  }
  @Delete('account/phone') async unlink(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const u = await this.member(req, proof.strict().parse(body));
    const result = await this.service.unlink(u.id);
    await this.audit.record('phone.unlinked', u.id);
    return result;
  }
  @Post('interaction/:uid/phone/challenge') async loginStart(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    checkCsrf(req, this.config.value);
    const details = await this.oidc.provider.interactionDetails(req, res);
    if (details.uid !== uid || details.prompt.name !== 'login')
      throw new UnauthorizedException();
    const d = z.object({ phone }).strict().parse(body);
    return this.service.start(
      await this.service.loginTarget(d.phone),
      d.phone,
      'login:' + uid,
      req.ip || '',
    );
  }
  @Post('interaction/:uid/phone/login') async login(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    checkCsrf(req, this.config.value);
    const details = await this.oidc.provider.interactionDetails(req, res);
    if (details.uid !== uid || details.prompt.name !== 'login')
      throw new UnauthorizedException();
    const d = z
      .object({
        challengeId: z.uuid(),
        code: z.string().regex(/^\d{6}$/),
        mfaCode: z.string().max(64).optional(),
      })
      .strict()
      .parse(body);
    const u = await this.service.consume(d.challengeId, d.code, 'login:' + uid);
    const factor = u.mfaEnabled
      ? await this.mfa.checkMfa(u, d.mfaCode || '')
      : undefined;
    await this.audit.record('login.success', u.id, { method: 'sms' });
    await this.oidc.provider.interactionFinished(
      req,
      res,
      {
        login: {
          accountId: u.id,
          amr: factor ? ['sms', factor] : ['sms'],
          acr: factor ? 'urn:tala:mfa' : 'urn:tala:sms',
          remember: true,
          ts: Math.floor(Date.now() / 1000),
        },
      },
      { mergeWithLastSubmission: false },
    );
  }
}
