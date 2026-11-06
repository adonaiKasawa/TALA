import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { OidcService } from '../oidc/oidc.service.js';
import { CredentialsService } from '../credentials/credentials.service.js';
import { MfaService } from '../mfa/mfa.service.js';
import { KeysService } from '../keys/keys.service.js';
import { Database } from '../database/database.service.js';
import { ConfigService } from '../config/config.service.js';
import { checkCsrf } from '../security/http-security.js';
import { digest, token } from '../security/crypto.js';
@Controller('account')
export class StepUpController {
  constructor(
    private readonly oidc: OidcService,
    private readonly credentials: CredentialsService,
    private readonly mfa: MfaService,
    private readonly db: Database,
    private readonly keys: KeysService,
    private readonly config: ConfigService,
  ) {}
  @Post('step-up') async issue(@Req() req: Request, @Body() body: unknown) {
    if (!req.headers.authorization?.startsWith('Bearer '))
      checkCsrf(req, this.config.value);
    const { user, payload } = await this.oidc.authenticate(req);
    const d = z
      .object({
        password: z.string().max(128).optional(),
        code: z.string().max(64),
        purpose: z.literal('withdrawal'),
        contextHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(body);
    await this.credentials.recent(user, d.password, payload);
    if (!user.mfaEnabled || (await this.mfa.checkMfa(user, d.code)) !== 'otp')
      throw new ForbiddenException('MFA TOTP obligatoire.');
    const value = token();
    await this.db.oidcArtifact.create({
      data: {
        model: 'StepUp',
        id: digest(value),
        accountId: user.id,
        expiresAt: new Date(Date.now() + 120000),
        payload: this.keys.seal({
          purpose: d.purpose,
          contextHash: d.contextHash,
          sid: payload.sid,
          gid: payload.gid,
        }),
      },
    });
    return { proof: value, expiresIn: 120, purpose: d.purpose };
  }
}
