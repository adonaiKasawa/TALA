import { Controller } from '@nestjs/common';
import {
  All,
  Get,
  Post,
  Delete,
  Req,
  Res,
  Param,
  Body,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { digest, equal, token } from '../security/crypto.js';
import { checkCsrf, csrfToken } from '../security/http-security.js';
import { page, form, input } from '../interactions/pages.js';
import { ConfigService } from '../config/config.service.js';
import { Database } from '../database/database.service.js';
import { KeysService } from '../keys/keys.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CredentialsService } from '../credentials/credentials.service.js';
import { MfaService } from '../mfa/mfa.service.js';
import { OidcService } from '../oidc/oidc.service.js';
import { adapterFactory } from '../oidc/persistence/postgres.adapter.js';
const providersSchema = z.array(
  z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    issuer: z.url(),
    clientId: z.string().min(1),
    clientSecret: z.string().optional(),
    scopes: z.string().default('openid email profile'),
    responseMode: z.enum(['query', 'form_post']).default('query'),
  }),
);
type Attempt = {
  verifier: string;
  nonce: string;
  provider: string;
  interaction?: string;
  linkUser?: string;
  returnTo?: string;
};
@Controller()
export class FederationController {
  constructor(
    private readonly config: ConfigService,
    private readonly db: Database,
    private readonly keys: KeysService,
    private readonly audit: AuditService,
    private readonly credentials: CredentialsService,
    private readonly mfa: MfaService,
    private readonly oidc: OidcService,
  ) {}
  providers() {
    const file = this.config.value.FEDERATION_PROVIDERS_PATH;
    const entries = file
      ? providersSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
      : [];
    if (
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      !entries.some((p) => p.id === 'google')
    )
      entries.push({
        id: 'google',
        issuer: 'https://accounts.google.com',
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        scopes: 'openid email profile',
        responseMode: 'query',
      });
    if (
      process.env.APPLE_CLIENT_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY_PATH &&
      !entries.some((p) => p.id === 'apple')
    )
      entries.push({
        id: 'apple',
        issuer: 'https://appleid.apple.com',
        clientId: process.env.APPLE_CLIENT_ID,
        scopes: 'name email',
        responseMode: 'form_post',
      });
    for (const p of entries)
      if (
        !p.issuer.startsWith('https://') &&
        !(
          this.config.value.NODE_ENV !== 'production' &&
          ['localhost', '127.0.0.1'].includes(new URL(p.issuer).hostname)
        )
      )
        throw new Error('Issuer fédéré non sécurisé');
    return entries;
  }
  private async client(id: string) {
    const provider = this.providers().find((p) => p.id === id);
    if (!provider) throw new BadRequestException('Fournisseur non configuré.');
    const lib = await import('openid-client');
    let secret = provider.clientSecret;
    if (provider.id === 'apple' && process.env.APPLE_PRIVATE_KEY_PATH) {
      const { SignJWT, importPKCS8 } = await import('jose');
      const key = await importPKCS8(
        readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, 'utf8'),
        'ES256',
      );
      secret = await new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID! })
        .setIssuer(process.env.APPLE_TEAM_ID!)
        .setSubject(provider.clientId)
        .setAudience('https://appleid.apple.com')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key);
    }
    const config = await lib.discovery(
      new URL(provider.issuer),
      provider.clientId,
      secret,
      provider.id === 'apple' && secret
        ? lib.ClientSecretPost(secret)
        : undefined,
      this.config.value.NODE_ENV === 'production'
        ? undefined
        : { execute: [lib.allowInsecureRequests] },
    );
    return { lib, config, provider };
  }
  private async start(
    id: string,
    res: Response,
    target: { interaction?: string; linkUser?: string; returnTo?: string },
  ) {
    const { lib, config, provider } = await this.client(id);
    if (provider.responseMode === 'form_post' && !this.config.value.secure)
      throw new BadRequestException(
        'Le retour form_post nécessite un issuer HTTPS.',
      );
    const state = lib.randomState(),
      nonce = lib.randomNonce(),
      verifier = lib.randomPKCECodeVerifier();
    await this.db.federationAttempt.create({
      data: {
        id: digest(state),
        expiresAt: new Date(Date.now() + 600000),
        content: this.keys.seal({
          verifier,
          nonce,
          provider: id,
          ...target,
        }),
      },
    });
    res.cookie('tala_federation', state, {
      signed: true,
      secure: this.config.value.secure,
      httpOnly: true,
      sameSite: provider.responseMode === 'form_post' ? 'none' : 'lax',
      maxAge: 600000,
      path: '/',
    });
    return lib
      .buildAuthorizationUrl(config, {
        response_type: 'code',
        response_mode: provider.responseMode,
        scope: provider.scopes,
        redirect_uri: `${this.config.value.issuer}/federation/${id}/callback`,
        state,
        nonce,
        code_challenge: await lib.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
      })
      .toString();
  }
  @Get('federation/providers') available() {
    return this.providers().map((p) => ({ id: p.id }));
  }
  @Get('interaction/:uid/federation/:provider') async login(
    @Param('uid') uid: string,
    @Param('provider') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const details = await this.oidc.provider.interactionDetails(req, res);
    if (details.uid !== uid || details.prompt.name !== 'login')
      throw new BadRequestException();
    res.redirect(await this.start(id, res, { interaction: uid }));
  }
  @Post('account/identities/:provider/link') async link(
    @Param('provider') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!req.headers.authorization?.startsWith('Bearer '))
      checkCsrf(req, this.config.value);
    const { user, payload } = await this.oidc.authenticate(req);
    if (user.passwordHash)
      await this.credentials.recent(
        user,
        z.object({ password: z.string().max(128) }).parse(req.body).password,
      );
    else await this.credentials.recent(user, undefined, payload);
    if ((req.body as { browser?: boolean })?.browser === true) {
      if (
        !this.config.value.AUTH_APPLICATION_CLIENT_IDS.split(',')
          .map((value) => value.trim())
          .includes(String(payload.client_id))
      )
        throw new BadRequestException('Application non autorisée.');
      const metadata = await new (adapterFactory(this.db, this.keys))(
        'Client',
      ).find(String(payload.client_id));
      const redirect: unknown = Array.isArray(metadata?.redirect_uris)
        ? metadata.redirect_uris[0]
        : undefined;
      if (typeof redirect !== 'string') throw new BadRequestException();
      const target = new URL(redirect);
      const returnTo =
        target.protocol === 'tala:'
          ? 'tala-app://account/linked'
          : ['http:', 'https:'].includes(target.protocol)
            ? target.origin + '/compte'
            : undefined;
      if (!returnTo) throw new BadRequestException();
      const ticket = token();
      await this.db.federationAttempt.create({
        data: {
          id: digest(ticket),
          expiresAt: new Date(Date.now() + 60000),
          content: this.keys.seal({
            kind: 'link-ticket',
            userId: user.id,
            grantId: payload.gid,
            provider: id,
            returnTo,
          }),
        },
      });
      return res.json({
        authorizationUrl: `${this.config.value.issuer}/federation/${id}/continue?ticket=${ticket}`,
      });
    }
    res.json({
      authorizationUrl: await this.start(id, res, { linkUser: user.id }),
    });
  }
  @Get('federation/:provider/continue') async continueLink(
    @Param('provider') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ticket = z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .parse(req.query.ticket);
    const row = await this.db.federationAttempt.findUnique({
      where: { id: digest(ticket) },
    });
    if (!row || row.expiresAt < new Date())
      throw new BadRequestException(
        'Association expirée. Recommencez depuis votre compte.',
      );
    const data = this.keys.open<{
      kind: string;
      userId: string;
      grantId: string;
      provider: string;
      returnTo: string;
    }>(row.content);
    if (data.kind !== 'link-ticket' || data.provider !== id)
      throw new BadRequestException();
    const user = await this.db.user.findUnique({ where: { id: data.userId } });
    const grant = await this.db.oidcArtifact.findFirst({
      where: {
        model: 'Grant',
        id: data.grantId,
        accountId: data.userId,
        expiresAt: { gt: new Date() },
      },
    });
    if (!user?.active || !grant) throw new UnauthorizedException();
    const removed = await this.db.federationAttempt.deleteMany({
      where: { id: row.id },
    });
    if (removed.count !== 1) throw new BadRequestException();
    return res.redirect(
      await this.start(id, res, {
        linkUser: data.userId,
        returnTo: data.returnTo,
      }),
    );
  }
  @All('federation/:provider/callback') async callback(
    @Param('provider') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!['GET', 'POST'].includes(req.method)) throw new BadRequestException();
    const parameters =
      req.method === 'POST'
        ? z.record(z.string(), z.string()).parse(req.body)
        : req.query;
    const state = parameters.state;
    if (
      typeof state !== 'string' ||
      typeof req.signedCookies?.tala_federation !== 'string' ||
      !equal(state, req.signedCookies.tala_federation)
    )
      throw new BadRequestException('État fédéré invalide.');
    const row = await this.db.federationAttempt.findUnique({
      where: { id: digest(state) },
    });
    if (!row || row.expiresAt < new Date())
      throw new BadRequestException('Connexion expirée.');
    const attempt = this.keys.open<Attempt>(row.content);
    if (attempt.provider !== id) throw new BadRequestException();
    const removed = await this.db.federationAttempt.deleteMany({
      where: { id: row.id },
    });
    if (removed.count !== 1) throw new BadRequestException();
    const { lib, config, provider } = await this.client(id);
    const url = new URL(req.originalUrl, this.config.value.issuer);
    const incoming =
      req.method === 'POST'
        ? new globalThis.Request(url, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(
              z.record(z.string(), z.string()).parse(req.body),
            ),
          })
        : url;
    const result = await lib
      .authorizationCodeGrant(config, incoming, {
        pkceCodeVerifier: attempt.verifier,
        expectedState: state,
        expectedNonce: attempt.nonce,
        idTokenExpected: true,
      })
      .catch(() => {
        throw new BadRequestException('Connexion fédérée refusée.');
      });
    const claims = result.claims();
    if (!claims?.sub)
      throw new BadRequestException('Identité externe invalide.');
    const db = this.db;
    const providerKey = `${id}|${provider.issuer}`;
    let user = await db.externalIdentity
      .findUnique({
        where: {
          provider_subject: { provider: providerKey, subject: claims.sub },
        },
        include: { user: true },
      })
      .then((link) => link?.user);
    if (attempt.linkUser) {
      const target = await db.user.findUnique({
        where: { id: attempt.linkUser },
      });
      if (!target?.active || (user && user.id !== target.id))
        throw new BadRequestException('Association impossible.');
      await db.externalIdentity.upsert({
        where: {
          provider_subject: { provider: providerKey, subject: claims.sub },
        },
        create: {
          provider: providerKey,
          subject: claims.sub,
          userId: target.id,
        },
        update: {},
      });
      await this.audit.record('identity.linked', target.id, { provider: id });
      res.clearCookie('tala_federation');
      if (attempt.returnTo) return res.redirect(attempt.returnTo);
      return res
        .type('html')
        .send(
          page(
            'Compte externe associé',
            '<a href="/review/account">Revenir à mon compte</a>',
          ),
        );
    }
    if (!user) {
      const emailVerified: unknown = claims.email_verified;
      if (
        (emailVerified !== true && emailVerified !== 'true') ||
        typeof claims.email !== 'string'
      )
        throw new BadRequestException('Email externe vérifié requis.');
      const email = z.email().parse(claims.email).toLowerCase();
      if (await db.user.findUnique({ where: { email } }))
        throw new BadRequestException(
          'Connecte-toi au compte existant pour associer ce fournisseur.',
        );
      user = await db.user.create({
        data: {
          email,
          emailVerified: true,
          username: `creator-${token().slice(0, 12)}`,
          externals: { create: { provider: providerKey, subject: claims.sub } },
        },
      });
    }
    if (!user.active || !attempt.interaction)
      throw new BadRequestException('Compte indisponible.');
    const pending = token();
    await db.federationAttempt.create({
      data: {
        id: digest(pending),
        expiresAt: new Date(Date.now() + 300000),
        content: this.keys.seal({
          userId: user.id,
          interaction: attempt.interaction,
          provider: id,
        }),
      },
    });
    res.cookie('tala_federation_result', pending, {
      signed: true,
      secure: this.config.value.secure,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 300000,
      path: '/',
    });
    res.clearCookie('tala_federation');
    res.redirect(
      `/interaction/${encodeURIComponent(attempt.interaction)}/federation-finish`,
    );
  }
  @Get('interaction/:uid/federation-finish') async finishGet(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.finish(uid, req, res, false);
  }
  @Post('interaction/:uid/federation-finish') async finishPost(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    checkCsrf(req, this.config.value);
    return this.finish(uid, req, res, true);
  }
  private async finish(
    uid: string,
    req: Request,
    res: Response,
    submitted: boolean,
  ) {
    const raw: unknown = req.signedCookies?.tala_federation_result;
    if (typeof raw !== 'string') throw new BadRequestException();
    const row = await this.db.federationAttempt.findUnique({
      where: { id: digest(raw) },
    });
    if (!row || row.expiresAt < new Date()) throw new BadRequestException();
    const pending = this.keys.open<{
      userId: string;
      interaction: string;
    }>(row.content);
    const details = await this.oidc.provider.interactionDetails(req, res);
    if (
      pending.interaction !== uid ||
      details.uid !== uid ||
      details.prompt.name !== 'login'
    )
      throw new BadRequestException();
    const user = await this.db.user.findUnique({
      where: { id: pending.userId },
    });
    if (!user?.active) throw new UnauthorizedException();
    if (user.mfaEnabled && !submitted)
      return res
        .type('html')
        .send(
          page(
            'Vérification MFA',
            form(
              `/interaction/${uid}/federation-finish`,
              csrfToken(req, res, this.config.value),
              input('code', 'Code MFA ou code de secours'),
              'Vérifier',
            ),
          ),
        );
    const factor = user.mfaEnabled
      ? await this.mfa.checkMfa(
          user,
          z.object({ code: z.string().min(6).max(64) }).parse(req.body).code,
        )
      : undefined;
    const removed = await this.db.federationAttempt.deleteMany({
      where: { id: row.id },
    });
    if (removed.count !== 1) throw new BadRequestException();
    res.clearCookie('tala_federation_result');
    await this.audit.record('login.federated', user.id);
    return this.oidc.provider.interactionFinished(
      req,
      res,
      {
        login: {
          accountId: user.id,
          amr: factor ? ['federated', factor] : ['federated'],
          acr: user.mfaEnabled ? 'urn:tala:mfa' : 'urn:tala:federated',
          ts: Math.floor(Date.now() / 1000),
          remember: true,
        },
      },
      { mergeWithLastSubmission: false },
    );
  }
  @Get('account/identities') async identities(@Req() req: Request) {
    const { user } = await this.oidc.authenticate(req);
    return (
      await this.db.externalIdentity.findMany({
        where: { userId: user.id },
        select: { provider: true },
      })
    ).map((v) => ({ provider: v.provider.split('|')[0] }));
  }
  @Delete('account/identities/:provider') async unlink(
    @Param('provider') id: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    if (!req.headers.authorization?.startsWith('Bearer '))
      checkCsrf(req, this.config.value);
    const { user, payload } = await this.oidc.authenticate(req);
    await this.credentials.recent(
      user,
      z.object({ password: z.string().max(128).optional() }).parse(body)
        .password,
      payload,
    );
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const alternatives = await tx.externalIdentity.count({
        where: { userId: user.id, NOT: { provider: { startsWith: `${id}|` } } },
      });
      if (!current.passwordHash && !alternatives)
        throw new BadRequestException(
          'Conserver au moins un moyen de connexion.',
        );
      await tx.externalIdentity.deleteMany({
        where: { userId: user.id, provider: { startsWith: `${id}|` } },
      });
    });
    await this.audit.record('identity.unlinked', user.id, { provider: id });
    return { message: 'Association retirée.' };
  }
}
