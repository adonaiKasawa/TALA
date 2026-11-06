import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import type { Principal } from './auth.metadata.js';
import { IdentitySyncService } from './identity-sync.service.js';
import { normalizeRole } from './permissions.js';

@Injectable()
export class AccessTokenService implements OnModuleInit {
  private jose!: typeof import('jose');
  private keys!: ReturnType<typeof import('jose').createRemoteJWKSet>;
  constructor(
    private readonly config: ConfigService,
    private readonly identity: IdentitySyncService,
  ) {}

  async onModuleInit() {
    this.jose = await import('jose');
    // Fixed trusted issuer, never a jku/issuer supplied by an unverified token.
    this.keys = this.jose.createRemoteJWKSet(
      new URL('/jwks', this.config.value.OIDC_ISSUER),
      { timeoutDuration: 3000, cooldownDuration: 5000, cacheMaxAge: 60000 },
    );
  }

  async verify(token: string): Promise<Principal> {
    try {
      const { payload } = await this.jose.jwtVerify(token, this.keys, {
        issuer: this.config.value.OIDC_ISSUER,
        audience: this.config.value.API_AUDIENCE,
        algorithms: ['RS256'],
        typ: 'at+jwt',
        requiredClaims: ['sub', 'iss', 'aud', 'exp', 'iat', 'client_id'],
        maxTokenAge: '15m',
        clockTolerance: 5,
      });
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        payload.sub.length > 255 ||
        typeof payload.client_id !== 'string' ||
        !payload.client_id ||
        Number(payload.iat) > Date.now() / 1000 + 5
      )
        throw new UnauthorizedException('Access token invalide.');
      const scopes =
        typeof payload.scope === 'string'
          ? payload.scope.split(' ').filter(Boolean)
          : [];
      if (!scopes.includes('tala.api'))
        throw new ForbiddenException('Scope tala.api requis.');
      // Profiles require a user session. Machine credentials never impersonate a user.
      if (
        typeof payload.sid !== 'string' ||
        !payload.sid ||
        typeof payload.gid !== 'string' ||
        !payload.gid
      )
        throw new ForbiddenException('Session utilisateur requise.');
      const state = process.env.IDENTITY_SYNC_KEY
        ? await this.identity.live(payload.sub, payload.sid, payload.gid)
        : null;
      return {
        issuer: payload.iss!,
        subject: payload.sub,
        clientId: payload.client_id,
        scopes,
        role: normalizeRole(state?.role ?? payload.role),
        amr: Array.isArray(payload.amr)
          ? payload.amr.filter((v): v is string => typeof v === 'string')
          : [],
        authTime:
          typeof payload.auth_time === 'number' ? payload.auth_time : undefined,
      };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      if (
        error instanceof this.jose.errors.JWKSTimeout ||
        (error instanceof Error && error.name === 'TypeError')
      )
        throw new ServiceUnavailableException(
          'Verification d’identite temporairement indisponible.',
        );
      throw new UnauthorizedException('Access token invalide ou expire.');
    }
  }
}
