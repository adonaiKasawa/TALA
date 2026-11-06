import { Injectable } from '@nestjs/common';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TOTP, Secret } from 'otpauth';
import type { User } from '../generated/prisma/client.js';
import { digest, token } from '../security/crypto.js';
import { Database } from '../database/database.service.js';
import { KeysService } from '../keys/keys.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CredentialsService } from '../credentials/credentials.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
@Injectable()
export class MfaService {
  constructor(
    private readonly db: Database,
    private readonly keys: KeysService,
    private readonly audit: AuditService,
    private readonly credentials: CredentialsService,
    private readonly sessions: SessionsService,
  ) {}
  async enrollMfa(
    user: User,
    password?: string,
    claims?: Record<string, unknown>,
  ) {
    await this.credentials.recent(user, password, claims);
    if (user.mfaEnabled) throw new BadRequestException('MFA déjà active.');
    const secret = new Secret({ size: 20 }).base32;
    const updated = await this.db.user.updateMany({
      where: { id: user.id, mfaEnabled: false },
      data: { mfaSecret: this.keys.seal(secret) },
    });
    if (updated.count !== 1) throw new BadRequestException('MFA déjà active.');
    return {
      secret,
      uri: new TOTP({ issuer: 'TALA', label: user.email, secret }).toString(),
    };
  }
  async checkMfa(user: User, code: string, allowRecovery = true) {
    if (!user.mfaSecret) throw new UnauthorizedException('Code invalide.');
    const totp = new TOTP({
      issuer: 'TALA',
      label: user.email,
      secret: this.keys.open<string>(user.mfaSecret),
    });
    const delta = totp.validate({ token: code, window: 1 });
    if (delta !== null) {
      const counter = BigInt(Math.floor(Date.now() / 30000) + delta);
      const result = await this.db.user.updateMany({
        where: {
          id: user.id,
          mfaCounter: { lt: counter },
          mfaSecret: user.mfaSecret,
        },
        data: { mfaCounter: counter },
      });
      if (result.count === 1) return 'otp' as const;
    }
    if (allowRecovery && user.recoveryCodes.includes(digest(code))) {
      const hashed = digest(code);
      const count = await this.db
        .$executeRaw`UPDATE "User" SET "recoveryCodes" = array_remove("recoveryCodes", ${hashed}) WHERE "id" = ${user.id} AND ${hashed} = ANY("recoveryCodes")`;
      if (count === 1) {
        await this.audit.record('mfa.recovery_used', user.id);
        return 'recovery' as const;
      }
    }
    throw new UnauthorizedException('Code invalide ou déjà utilisé.');
  }
  async confirmMfa(user: User, code: string) {
    if (user.mfaEnabled) throw new BadRequestException('MFA déjà active.');
    await this.checkMfa(user, code, false);
    const codes = Array.from({ length: 10 }, () => token().slice(0, 16));
    const updated = await this.db.user.updateMany({
      where: { id: user.id, mfaEnabled: false, mfaSecret: user.mfaSecret },
      data: { mfaEnabled: true, recoveryCodes: codes.map(digest) },
    });
    if (updated.count !== 1)
      throw new BadRequestException('Préparation MFA modifiée. Recommence.');
    await this.sessions.revokeUser(user.id);
    await this.audit.record('mfa.enabled', user.id);
    return { recoveryCodes: codes };
  }
  async disableMfa(
    user: User,
    password: string | undefined,
    code: string,
    claims?: Record<string, unknown>,
  ) {
    if (['admin', 'moderator'].includes(user.role))
      throw new BadRequestException('La MFA est obligatoire pour ce rôle.');
    await this.credentials.recent(user, password, claims);
    await this.checkMfa(user, code);
    await this.db.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaCounter: 0,
        recoveryCodes: [],
      },
    });
    await this.sessions.revokeUser(user.id);
    await this.audit.record('mfa.disabled', user.id);
    return { message: 'MFA désactivée ; reconnecte-toi.' };
  }
  async renewRecoveryCodes(
    user: User,
    password: string | undefined,
    code: string,
    claims?: Record<string, unknown>,
  ) {
    await this.credentials.recent(user, password, claims);
    if (!user.mfaEnabled) throw new BadRequestException('MFA inactive.');
    await this.checkMfa(user, code);
    const codes = Array.from({ length: 10 }, () => token().slice(0, 16));
    await this.db.user.update({
      where: { id: user.id },
      data: { recoveryCodes: codes.map(digest) },
    });
    await this.sessions.revokeUser(user.id);
    await this.audit.record('mfa.recovery_renewed', user.id);
    return { recoveryCodes: codes };
  }
}
