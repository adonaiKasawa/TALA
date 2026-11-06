import { Injectable } from '@nestjs/common';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import type Provider from 'oidc-provider';
import type { Request } from 'express';
import { adapterFactory } from './persistence/postgres.adapter.js';
import { digest } from '../security/crypto.js';
import { page } from '../interactions/pages.js';
import { ConfigService } from '../config/config.service.js';
import { Database } from '../database/database.service.js';
import { KeysService } from '../keys/keys.service.js';
import { AuditService } from '../audit/audit.service.js';
import { formPolicy } from '../security/form-policy.js';

@Injectable()
export class OidcService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: Database,
    private readonly keys: KeysService,
    private readonly audit: AuditService,
  ) {}
  provider!: Provider;
  private jwks!: ReturnType<typeof import('jose').createLocalJWKSet>;
  async initialize() {
    const { Provider, errors } = await import('oidc-provider');
    const { createLocalJWKSet } = await import('jose');
    const db = this.db,
      vault = this.keys,
      config = this.config.value;
    const Adapter = adapterFactory(db, vault);
    {
      await new Adapter('Client').upsert(
        config.AUTH_REVIEW_CLIENT_ID,
        {
          client_id: config.AUTH_REVIEW_CLIENT_ID,
          client_name: 'Console de vérification TALA',
          redirect_uris: [`${config.issuer}/review/callback`],
          post_logout_redirect_uris: [config.issuer],
          response_types: ['code'],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: 'none',
          scope: 'openid profile email offline_access tala.identity tala.admin',
        },
        0,
      );
    }
    this.provider = new Provider(config.issuer, {
      adapter: Adapter,
      jwks: config.jwks,
      clients: [],
      extraParams: ['tala_action'],
      cookies: {
        keys: config.cookieKeys,
        long: { secure: config.secure, httpOnly: true, sameSite: 'lax' },
        short: { secure: config.secure, httpOnly: true, sameSite: 'lax' },
      },
      pkce: { required: () => true },
      scopes: [
        'openid',
        'profile',
        'email',
        'offline_access',
        'tala.api',
        'tala.identity',
        'tala.admin',
      ],
      claims: {
        openid: ['sub'],
        profile: ['preferred_username'],
        email: ['email', 'email_verified'],
      },
      subjectTypes: ['public'],
      responseTypes: ['code'],
      features: {
        devInteractions: { enabled: false },
        revocation: { enabled: true },
        introspection: { enabled: true },
        rpInitiatedLogout: {
          enabled: true,
          logoutSource: (ctx, logoutForm) => {
            const policy = formPolicy(
              ctx.response.get('Content-Security-Policy'),
              ctx.oidc.params?.post_logout_redirect_uri,
            );
            if (policy) ctx.set('Content-Security-Policy', policy);
            ctx.type = 'html';
            ctx.body = page(
              'Se déconnecter',
              logoutForm +
                '<button type="submit" form="op.logoutForm" name="logout" value="yes">Confirmer la déconnexion</button>',
            );
          },
          postLogoutSuccessSource: (ctx) => {
            ctx.type = 'html';
            ctx.body = page(
              'Déconnexion effectuée',
              '<a href="/">Revenir à TALA</a>',
            );
          },
        },
        clientCredentials: { enabled: true },
        resourceIndicators: {
          enabled: true,
          defaultResource: (ctx, client, oneOf) => {
            if (oneOf)
              return oneOf.includes(config.API_AUDIENCE)
                ? config.API_AUDIENCE
                : oneOf[0];
            // First-party native clients cannot send repeated resource parameters through AppAuth.
            // The server selects both registered resources at authorization, then one per token.
            if (
              ctx.method === 'GET' &&
              ctx.path === '/auth' &&
              config.AUTH_APPLICATION_CLIENT_IDS.split(',')
                .map((id) => id.trim())
                .includes(client.clientId)
            )
              return [config.API_AUDIENCE, config.IDENTITY_AUDIENCE];
            return config.API_AUDIENCE;
          },
          useGrantedResource: () => true,
          getResourceServerInfo: (ctx, resource) => {
            if (
              ![config.API_AUDIENCE, config.IDENTITY_AUDIENCE].includes(
                resource,
              )
            )
              throw new errors.InvalidTarget();
            const identityResource = resource === config.IDENTITY_AUDIENCE;
            const adminClient = config.adminClientIds.includes(
              ctx.oidc.client!.clientId,
            );
            return {
              scope: identityResource
                ? `tala.identity${adminClient ? ' tala.admin' : ''}`
                : 'tala.api',
              audience: resource,
              accessTokenFormat: 'jwt',
              accessTokenTTL: config.AUTH_ACCESS_TOKEN_TTL,
              jwt: { sign: { alg: 'RS256' } },
            };
          },
        },
      },
      ttl: {
        AccessToken: config.AUTH_ACCESS_TOKEN_TTL,
        ClientCredentials: config.AUTH_ACCESS_TOKEN_TTL,
        AuthorizationCode: config.AUTH_CODE_TTL,
        IdToken: config.AUTH_ACCESS_TOKEN_TTL,
        RefreshToken: (_ctx, refreshToken) =>
          Math.min(
            config.AUTH_REFRESH_IDLE_TTL,
            config.AUTH_REFRESH_ABSOLUTE_TTL - refreshToken.totalLifetime(),
          ),
        Session: 86400,
        Interaction: 600,
        Grant: config.AUTH_REFRESH_ABSOLUTE_TTL,
      },
      rotateRefreshToken: (ctx) => {
        if (
          ctx.oidc.entities.RefreshToken!.totalLifetime() >=
          config.AUTH_REFRESH_ABSOLUTE_TTL
        )
          throw new errors.InvalidGrant('refresh lifetime exceeded');
        return true;
      },
      interactions: {
        url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
      },
      findAccount: async (_ctx, id) => {
        const user = await db.user.findUnique({ where: { id } });
        if (!user?.active || !user.emailVerified) return undefined;
        return {
          accountId: user.id,
          claims: () => ({
            sub: user.id,
            email: user.email,
            email_verified: user.emailVerified,
            preferred_username: user.username,
          }),
        };
      },
      extraTokenClaims: async (ctx, accessToken) => {
        const source =
          ctx.oidc.entities.RefreshToken ?? ctx.oidc.entities.AuthorizationCode;
        return 'sessionUid' in accessToken
          ? {
              sid: accessToken.sessionUid,
              gid: accessToken.grantId,
              auth_time: source?.authTime,
              amr: source?.amr,
              role:
                (
                  await db.user.findUnique({
                    where: { id: accessToken.accountId },
                    select: { role: true },
                  })
                )?.role || 'viewer',
            }
          : {};
      },
      renderError: (ctx, output) => {
        ctx.type = 'application/json';
        ctx.body = {
          error: output.error,
          error_description: 'Requête OAuth/OIDC refusée.',
        };
      },
    });
    this.provider.proxy = Boolean(config.AUTH_TRUST_PROXY);
    const publicKeys = config.jwks.keys.map((key) => ({
      kty: key.kty,
      kid: key.kid,
      alg: key.alg,
      use: key.use,
      n: key.n,
      e: key.e,
    }));
    this.jwks = createLocalJWKSet({ keys: publicKeys });
    this.provider.on('server_error', () => {
      void this.audit.record('oidc.server_error').catch(() => {});
    });
    this.provider.on('grant.error', () => {
      void this.audit.record('oidc.grant_denied').catch(() => {});
    });
  }
  async authenticate(req: Request, admin = false) {
    const header = req.headers.authorization;
    let accessToken = header?.startsWith('Bearer ')
      ? header.slice(7)
      : undefined;
    const reviewCookie: unknown = req.signedCookies?.tala_review;
    if (!accessToken && typeof reviewCookie === 'string') {
      const session = await new (adapterFactory(this.db, this.keys))(
        'ReviewSession',
      ).find(digest(reviewCookie));
      accessToken = session?.accessToken as string | undefined;
    }
    if (!accessToken) throw new UnauthorizedException();
    try {
      const { jwtVerify } = await import('jose');
      const { payload } = await jwtVerify(accessToken, this.jwks, {
        issuer: this.config.value.issuer,
        audience: this.config.value.IDENTITY_AUDIENCE,
        algorithms: ['RS256'],
        typ: 'at+jwt',
        requiredClaims: ['exp', 'iat', 'sub', 'sid', 'gid', 'client_id'],
      });
      if (
        typeof payload.scope !== 'string' ||
        !payload.scope.split(' ').includes('tala.identity')
      )
        throw new Error('scope');
      const user = await this.db.user.findUnique({
        where: { id: payload.sub! },
      });
      const session = await this.db.oidcArtifact.findFirst({
        where: {
          model: 'Session',
          uid: String(payload.sid),
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!user?.active || !session || session.accountId !== user.id)
        throw new Error('session');
      const grant = await this.db.oidcArtifact.findFirst({
        where: {
          model: 'Grant',
          id: String(payload.gid),
          accountId: user.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!grant) throw new Error('grant');
      if (
        admin &&
        (!payload.scope.split(' ').includes('tala.admin') ||
          typeof payload.client_id !== 'string' ||
          !this.config.value.adminClientIds.includes(payload.client_id) ||
          user.role !== 'admin' ||
          !user.mfaEnabled ||
          !Number.isFinite(payload.auth_time) ||
          !Array.isArray(payload.amr) ||
          !payload.amr.includes('otp') ||
          Number(payload.auth_time) < Date.now() / 1000 - 300)
      )
        throw new ForbiddenException('Administrateur et MFA récente requis.');
      return { user, payload };
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new UnauthorizedException('Session invalide ou expirée.');
    }
  }
}
