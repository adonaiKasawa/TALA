import { Injectable } from '@nestjs/common';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { User } from '../generated/prisma/client.js';
import { digest, token } from '../security/crypto.js';
import { ConfigService } from '../config/config.service.js';
import { Database } from '../database/database.service.js';
import { KeysService } from '../keys/keys.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RateLimitService } from '../security/rate-limit.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
@Injectable()
export class CredentialsService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: Database,
    private readonly keys: KeysService,
    private readonly audit: AuditService,
    private readonly limits: RateLimitService,
    private readonly sessions: SessionsService,
  ) {}
  private dummy = hash(token(), {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  async passwordUser(email: string, password: string) {
    await this.limits.check(`login:${email.toLowerCase()}`);
    const user = await this.db.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    const valid = await verify(
      user?.passwordHash ?? (await this.dummy),
      password,
    ).catch(() => false);
    if (!valid || !user?.active || !user.emailVerified) {
      await this.audit.record('login.failed');
      throw new UnauthorizedException(
        'Identifiants invalides ou compte indisponible.',
      );
    }
    return user;
  }
  async action(user: User, kind: 'verify' | 'reset') {
    const raw = token();
    await this.db.$transaction(async (tx) => {
      await tx.accountAction.deleteMany({ where: { userId: user.id, kind } });
      await tx.accountAction.create({
        data: {
          id: digest(raw),
          userId: user.id,
          kind,
          expiresAt: new Date(
            Date.now() + (kind === 'reset' ? 15 : 60) * 60000,
          ),
        },
      });
      await tx.mail.create({
        data: {
          userId: user.id,
          content: this.keys.seal({
            to: user.email,
            subject:
              kind === 'reset'
                ? 'Réinitialisation du mot de passe TALA'
                : 'Vérification du compte TALA',
            text: `${this.config.value.issuer}/${kind === 'reset' ? 'reset-password' : 'verify-email'}?token=${raw}`,
          }),
        },
      });
    });
  }
  async requestAction(email: string, kind: 'verify' | 'reset') {
    await this.limits.check(`action:${kind}:${email.toLowerCase()}`, 3);
    const user = await this.db.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (user?.active && (kind !== 'verify' || !user.emailVerified))
      await this.action(user, kind);
    return { message: 'Si le compte est éligible, un email a été envoyé.' };
  }
  async confirmAction(
    raw: string,
    kind: 'verify' | 'reset',
    password?: string,
  ) {
    const passwordHash = password
      ? await hash(password, { memoryCost: 65536, timeCost: 3, parallelism: 1 })
      : undefined;
    const user = await this.db.$transaction(async (tx) => {
      const action = await tx.accountAction.findUnique({
        where: { id: digest(raw) },
      });
      if (!action || action.kind !== kind || action.expiresAt < new Date())
        throw new BadRequestException('Lien invalide ou expiré.');
      const consumed = await tx.accountAction.deleteMany({
        where: { id: action.id },
      });
      if (consumed.count !== 1)
        throw new BadRequestException('Lien déjà utilisé.');
      const current = await tx.user.findUniqueOrThrow({
        where: { id: action.userId },
      });
      if (!current.active)
        throw new BadRequestException('Compte indisponible.');
      return tx.user.update({
        where: { id: action.userId },
        data: kind === 'verify' ? { emailVerified: true } : { passwordHash },
      });
    });
    if (kind === 'reset') await this.sessions.revokeUser(user.id);
    await this.audit.record(`account.${kind}`, user.id);
    return { message: 'Opération effectuée.' };
  }
  async recent(
    user: User,
    password?: string,
    claims?: Record<string, unknown>,
  ) {
    if (!user.passwordHash) {
      if (
        !Number.isFinite(claims?.auth_time) ||
        Number(claims?.auth_time) < Date.now() / 1000 - 300 ||
        !Array.isArray(claims?.amr) ||
        !claims.amr.includes('federated')
      )
        throw new UnauthorizedException('Reconnexion fédérée récente requise.');
      return;
    }
    if (
      !password ||
      !(await verify(user.passwordHash, password).catch(() => false))
    )
      throw new UnauthorizedException('Mot de passe actuel requis.');
  }
  async changePassword(
    user: User,
    current: string | undefined,
    next: string,
    claims?: Record<string, unknown>,
  ) {
    await this.recent(user, current, claims);
    const passwordHash = await hash(next, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    await this.db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await this.sessions.revokeUser(user.id);
    await this.audit.record('password.changed', user.id);
    return { message: 'Mot de passe changé ; reconnecte tes appareils.' };
  }
}
