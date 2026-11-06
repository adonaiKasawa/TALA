import { Controller } from '@nestjs/common';
import {
  Get,
  Post,
  Patch,
  Delete,
  Req,
  Res,
  Body,
  ForbiddenException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { csrfToken, checkCsrf } from '../security/http-security.js';
import { page, form, input } from '../interactions/pages.js';
import { publicUser } from './public-user.js';
import { ConfigService } from '../config/config.service.js';
import { Database } from '../database/database.service.js';
import { CredentialsService } from '../credentials/credentials.service.js';
import { IdentityService } from './identity.service.js';
import { OidcService } from '../oidc/oidc.service.js';
const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const password = z.string().min(12).max(128);
const username = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-zA-Z0-9_.-]+$/);
@Controller('')
export class IdentityController {
  constructor(
    private readonly config: ConfigService,
    private readonly db: Database,
    private readonly credentials: CredentialsService,
    private readonly identity: IdentityService,
    private readonly oidc: OidcService,
  ) {}
  private check(req: Request) {
    checkCsrf(req, this.config.value);
  }
  private csrf(req: Request, res: Response) {
    return csrfToken(req, res, this.config.value);
  }
  private async member(req: Request, admin = false) {
    if (
      !req.headers.authorization?.startsWith('Bearer ') &&
      !['GET', 'HEAD'].includes(req.method)
    )
      this.check(req);
    return this.oidc.authenticate(req, admin);
  }
  @Get('register') registerPage(@Req() req: Request, @Res() res: Response) {
    res
      .type('html')
      .send(
        page(
          'Créer un compte',
          form(
            '/account/register',
            this.csrf(req, res),
            input('email', 'Email', 'email') +
              input('username', 'Pseudonyme') +
              input(
                'password',
                'Mot de passe — 12 caractères minimum',
                'password',
              ),
            'Créer le compte',
          ),
        ),
      );
  }
  @Post('account/register') register(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    this.check(req);
    const data = z.object({ email, username, password }).parse(body);
    return this.identity.register(data.email, data.username, data.password);
  }
  @Get('account/me') async me(@Req() req: Request) {
    return publicUser((await this.member(req)).user);
  }
  @Post('account/type') async accountType(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { user } = await this.member(req);
    if (!['user', 'viewer', 'creator', 'professional'].includes(user.role))
      throw new ForbiddenException('Rôle administratif non modifiable ici.');
    const role = z
      .object({ role: z.enum(['viewer', 'creator', 'professional']) })
      .strict()
      .parse(body).role;
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74180327)`;
      await tx.user.update({ where: { id: user.id }, data: { role } });
      await tx.identityEvent.create({
        data: { subject: user.id, kind: 'state', active: true, role },
      });
      await tx.oidcArtifact.deleteMany({
        where: {
          accountId: user.id,
          model: { in: ['Grant', 'RefreshToken', 'Session', 'AccessToken'] },
        },
      });
    });
    return { role, message: 'Type de compte modifié ; reconnectez-vous.' };
  }
  @Patch('account/me') async update(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { user } = await this.member(req);
    const data = z.object({ username }).parse(body);
    return publicUser(
      await this.db.user.update({ where: { id: user.id }, data }),
    );
  }
  @Get('account/export') async export(@Req() req: Request) {
    const { user } = await this.member(req);
    return {
      profile: publicUser(user),
      externals: await this.db.externalIdentity.findMany({
        where: { userId: user.id },
        select: { provider: true, subject: true },
      }),
      events: await this.db.auditEvent.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }
  @Delete('account/me') async erase(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { user, payload } = await this.member(req);
    if (
      (user.mfaEnabled || ['admin', 'moderator'].includes(user.role)) &&
      (!user.mfaEnabled ||
        !Array.isArray(payload.amr) ||
        !payload.amr.includes('otp') ||
        !Number.isFinite(payload.auth_time) ||
        Number(payload.auth_time) < Date.now() / 1000 - 300 ||
        Number(payload.auth_time) > Date.now() / 1000 + 5)
    )
      throw new ForbiddenException(
        'MFA récente requise pour supprimer ce compte.',
      );
    await this.credentials.recent(
      user,
      z.object({ password: z.string().max(128).optional() }).parse(body)
        .password,
      payload,
    );
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74180327)`;
      await tx.identityEvent.create({
        data: {
          subject: user.id,
          kind: 'deleted',
          role: user.role,
          active: false,
        },
      });
      await tx.phoneChallenge.deleteMany({ where: { userId: user.id } });
      await tx.oidcArtifact.deleteMany({ where: { accountId: user.id } });
      await tx.mail.deleteMany({ where: { userId: user.id } });
      await tx.auditEvent.updateMany({
        where: { userId: user.id },
        data: { userId: null, detail: {} },
      });
      await tx.user.delete({ where: { id: user.id } });
    });
    return { message: 'Compte identité supprimé.' };
  }
}
