import { Controller } from '@nestjs/common';
import {
  Get,
  Post,
  Param,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { csrfToken, checkCsrf } from '../security/http-security.js';
import { page, form, input, escape } from './pages.js';
import { readFileSync } from 'node:fs';
import { ConfigService } from '../config/config.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CredentialsService } from '../credentials/credentials.service.js';
import { MfaService } from '../mfa/mfa.service.js';
import { OidcService } from '../oidc/oidc.service.js';
import { formPolicy } from '../security/form-policy.js';
const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const code = z.string().min(6).max(64);
@Controller('')
export class InteractionsController {
  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly credentials: CredentialsService,
    private readonly mfa: MfaService,
    private readonly oidc: OidcService,
  ) {}
  private check(req: Request) {
    checkCsrf(req, this.config.value);
  }
  private csrf(req: Request, res: Response) {
    return csrfToken(req, res, this.config.value);
  }
  @Get('interaction/:uid') async interaction(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const details = await this.oidc.provider.interactionDetails(req, res);
    if (details.uid !== uid) throw new BadRequestException();
    const policy = formPolicy(
      res.getHeader('Content-Security-Policy'),
      details.params.redirect_uri,
    );
    if (policy) res.setHeader('Content-Security-Policy', policy);
    res.cookie('tala_continue', `/interaction/${uid}`, {
      signed: true,
      httpOnly: true,
      secure: this.config.value.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 600000,
    });
    const csrf = this.csrf(req, res);
    if (details.prompt.name === 'login') {
      if (
        details.params.tala_action === 'register' &&
        req.signedCookies?.tala_signup !== uid
      ) {
        res.cookie('tala_signup', uid, {
          signed: true,
          httpOnly: true,
          secure: this.config.value.secure,
          sameSite: 'lax',
          path: '/',
          maxAge: 600000,
        });
        return res.redirect('/register');
      }
      const file = this.config.value.FEDERATION_PROVIDERS_PATH;
      const providers = file
        ? z
            .array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/) }))
            .parse(JSON.parse(readFileSync(file, 'utf8')))
        : [];
      const links = providers
        .map(
          (p) =>
            `<p><a href="/interaction/${encodeURIComponent(uid)}/federation/${p.id}">Continuer avec ${escape(p.id)}</a></p>`,
        )
        .join('');
      res
        .type('html')
        .send(
          page(
            'Connexion',
            form(
              `/interaction/${encodeURIComponent(uid)}/login`,
              csrf,
              input('email', 'Email', 'email') +
                input('password', 'Mot de passe', 'password') +
                input(
                  'code',
                  'Code MFA ou code de secours, si activé',
                  'text',
                  false,
                ),
              'Se connecter',
            ) +
              links +
              '<nav><a href="/register">Créer un compte</a><a href="/forgot-password">Mot de passe oublié</a><a href="/verify-email/request">Renvoyer l’email de vérification</a></nav>',
          ),
        );
    } else {
      const client = await this.oidc.provider.Client.find(
        String(details.params.client_id),
      );
      const labels: Record<string, string> = {
        openid: 'Vous identifier sur TALA',
        profile: 'Consulter votre présentation',
        email: 'Lire votre adresse email vérifiée',
        offline_access: 'Vous garder connecté sur cet appareil',
        'tala.api': 'Gérer votre profil et vos préférences',
        'tala.identity': 'Gérer la sécurité de votre compte',
        'tala.admin': 'Administrer les comptes TALA',
      };
      const permissions = String(details.params.scope)
        .split(' ')
        .filter((scope) => labels[scope])
        .map((scope) => `<li>${escape(labels[scope])}</li>`)
        .join('');
      res
        .type('html')
        .send(
          page(
            'Autoriser l’application',
            `<p><strong>${escape(client?.clientName || 'TALA')}</strong> souhaite :</p><ul>${permissions}</ul>` +
              form(
                `/interaction/${encodeURIComponent(uid)}/confirm`,
                csrf,
                '',
                'Autoriser',
              ) +
              form(
                `/interaction/${encodeURIComponent(uid)}/abort`,
                csrf,
                '',
                'Refuser',
              ),
          ),
        );
    }
  }
  @Post('interaction/:uid/login') async login(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.check(req);
    const data = z
      .object({
        email,
        password: z.string().max(128),
        code: code.optional().or(z.literal('')),
      })
      .parse(req.body);
    const details = await this.oidc.provider.interactionDetails(req, res);
    if (details.uid !== uid || details.prompt.name !== 'login')
      throw new BadRequestException();
    const user = await this.credentials.passwordUser(data.email, data.password);
    const factor = user.mfaEnabled
      ? await this.mfa.checkMfa(user, data.code || '')
      : undefined;
    await this.audit.record('login.success', user.id);
    await this.oidc.provider.interactionFinished(
      req,
      res,
      {
        login: {
          accountId: user.id,
          amr: factor ? ['pwd', factor] : ['pwd'],
          acr: user.mfaEnabled ? 'urn:tala:mfa' : 'urn:tala:password',
          remember: true,
          ts: Math.floor(Date.now() / 1000),
        },
      },
      { mergeWithLastSubmission: false },
    );
  }
  @Post('interaction/:uid/confirm') async consent(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.check(req);
    const details = await this.oidc.provider.interactionDetails(req, res);
    if (
      details.uid !== uid ||
      details.prompt.name !== 'consent' ||
      !details.session?.accountId
    )
      throw new BadRequestException();
    const grant = details.grantId
      ? await this.oidc.provider.Grant.find(details.grantId)
      : new this.oidc.provider.Grant({
          accountId: details.session.accountId,
          clientId: String(details.params.client_id),
        });
    if (!grant) throw new BadRequestException();
    const missing = details.prompt.details;
    if (missing.missingOIDCScope)
      grant.addOIDCScope((missing.missingOIDCScope as string[]).join(' '));
    if (missing.missingOIDCClaims)
      grant.addOIDCClaims(missing.missingOIDCClaims as string[]);
    if (missing.missingResourceScopes)
      for (const [resource, scopes] of Object.entries(
        missing.missingResourceScopes as Record<string, string[]>,
      ))
        grant.addResourceScope(resource, scopes.join(' '));
    const grantId = await grant.save();
    await this.oidc.provider.interactionFinished(
      req,
      res,
      { consent: { grantId } },
      { mergeWithLastSubmission: true },
    );
  }
  @Post('interaction/:uid/abort') async abort(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.check(req);
    const details = await this.oidc.provider.interactionDetails(req, res);
    if (details.uid !== uid) throw new BadRequestException();
    await this.oidc.provider.interactionFinished(
      req,
      res,
      { error: 'access_denied' },
      { mergeWithLastSubmission: false },
    );
  }
}
