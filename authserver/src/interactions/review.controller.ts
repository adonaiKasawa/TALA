import { Controller } from '@nestjs/common';
import { Get, Post, Req, Res, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { adapterFactory } from '../oidc/persistence/postgres.adapter.js';
import { digest, token, equal } from '../security/crypto.js';
import { csrfToken, checkCsrf } from '../security/http-security.js';
import { escape, form, input, page } from './pages.js';
import { publicUser } from '../identity/public-user.js';
import { ConfigService } from '../config/config.service.js';
import { Database } from '../database/database.service.js';
import { KeysService } from '../keys/keys.service.js';
import { OidcService } from '../oidc/oidc.service.js';

@Controller('review')
export class ReviewController {
  constructor(
    private readonly config: ConfigService,
    private readonly db: Database,
    private readonly keys: KeysService,
    private readonly oidc: OidcService,
  ) {}
  private adapter(model: string) {
    return new (adapterFactory(this.db, this.keys))(model);
  }
  @Get() async start(@Req() req: Request, @Res() res: Response) {
    const config = this.config.value;
    const state = token(),
      nonce = token(),
      verifier = token();
    await this.adapter('ReviewFlow').upsert(
      digest(state),
      { verifier, nonce },
      600,
    );
    res.cookie('tala_flow', state, {
      signed: true,
      secure: config.secure,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 600000,
    });
    const challenge = Buffer.from(digest(verifier), 'hex').toString(
      'base64url',
    );
    const url = new URL('/auth', config.issuer);
    url.search = new URLSearchParams({
      client_id: config.AUTH_REVIEW_CLIENT_ID,
      redirect_uri: `${config.issuer}/review/callback`,
      response_type: 'code',
      scope: 'openid profile email offline_access tala.identity tala.admin',
      prompt: 'consent',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      nonce,
      resource: config.IDENTITY_AUDIENCE,
    }).toString();
    res.redirect(url.toString());
  }
  @Get('callback') async callback(@Req() req: Request, @Res() res: Response) {
    const state = req.query.state;
    if (
      typeof state !== 'string' ||
      typeof req.signedCookies?.tala_flow !== 'string' ||
      !equal(state, req.signedCookies.tala_flow) ||
      typeof req.query.code !== 'string'
    )
      throw new BadRequestException('Connexion annulée ou état invalide.');
    const flow = await this.adapter('ReviewFlow').find(digest(state));
    if (!flow) throw new BadRequestException('Connexion expirée.');
    await this.adapter('ReviewFlow').destroy(digest(state));
    const config = this.config.value;
    const response = await fetch(`${config.issuer}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.AUTH_REVIEW_CLIENT_ID,
        code: req.query.code,
        redirect_uri: `${config.issuer}/review/callback`,
        grant_type: 'authorization_code',
        code_verifier: String(flow.verifier),
        resource: config.IDENTITY_AUDIENCE,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const result = (await response.json()) as Record<string, string>;
    if (!response.ok || !result.id_token || !result.access_token)
      throw new BadRequestException('Échange du code refusé.');
    const { jwtVerify, createRemoteJWKSet } = await import('jose');
    const { payload } = await jwtVerify(
      result.id_token,
      createRemoteJWKSet(new URL('/jwks', config.issuer)),
      {
        issuer: config.issuer,
        audience: config.AUTH_REVIEW_CLIENT_ID,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'sub', 'nonce'],
      },
    );
    if (payload.nonce !== flow.nonce)
      throw new BadRequestException('Nonce invalide.');
    const id = token();
    await this.adapter('ReviewSession').upsert(
      digest(id),
      { accessToken: result.access_token, accountId: payload.sub },
      300,
    );
    res.clearCookie('tala_flow');
    res.cookie('tala_review', id, {
      signed: true,
      secure: config.secure,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 300000,
    });
    res.redirect('/review/account');
  }
  @Get('account') async account(@Req() req: Request, @Res() res: Response) {
    const { user } = await this.oidc.authenticate(req);
    const csrf = csrfToken(req, res, this.config.value);
    res
      .type('html')
      .send(
        page(
          'Mon compte',
          `<pre>${escape(JSON.stringify(publicUser(user), null, 2))}</pre><nav><a href="/account/sessions">Mes sessions</a><a href="/account/grants">Mes autorisations</a><a href="/account/export">Exporter mes données</a></nav>` +
            form(
              '/account/mfa/enroll',
              csrf,
              input('password', 'Mot de passe actuel', 'password'),
              'Préparer la MFA',
            ) +
            form(
              '/account/mfa/confirm',
              csrf,
              input('code', 'Code de l’authenticator après préparation'),
              'Activer la MFA',
            ) +
            form(
              '/account/password/change',
              csrf,
              input('currentPassword', 'Mot de passe actuel', 'password') +
                input('password', 'Nouveau mot de passe', 'password'),
              'Changer le mot de passe',
            ) +
            form(
              '/account/sessions/revoke-all',
              csrf,
              '',
              'Déconnecter tous mes appareils',
            ) +
            form('/review/logout', csrf, '', 'Fermer la console') +
            '<small>La console conserve ses tokens côté serveur pendant 5 minutes. Les réponses de préparation MFA et les codes de secours doivent être conservés avant de revenir au formulaire suivant. Les autres opérations sont accessibles via les endpoints documentés.</small>',
        ),
      );
  }
  @Post('logout') async logout(@Req() req: Request, @Res() res: Response) {
    checkCsrf(req, this.config.value);
    const cookie: unknown = req.signedCookies?.tala_review;
    if (typeof cookie === 'string')
      await this.adapter('ReviewSession').destroy(digest(cookie));
    res.clearCookie('tala_review');
    res.redirect('/');
  }
}
