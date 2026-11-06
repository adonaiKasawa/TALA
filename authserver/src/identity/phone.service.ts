import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { Database } from '../database/database.service.js';
import { KeysService } from '../keys/keys.service.js';
import { RateLimitService } from '../security/rate-limit.service.js';
import { equal } from '../security/crypto.js';
@Injectable()
export class PhoneService {
  constructor(
    private readonly db: Database,
    private readonly keys: KeysService,
    private readonly limits: RateLimitService,
  ) {}
  private hash(id: string, code: string) {
    return createHmac(
      'sha256',
      Buffer.from(process.env.AUTH_ENCRYPTION_KEY!, 'hex'),
    )
      .update(id + '|' + code)
      .digest('hex');
  }
  async start(
    userId: string | null,
    phone: string,
    purpose: string,
    ip: string,
  ) {
    const driver = process.env.SMS_DRIVER || 'disabled';
    if (
      driver === 'disabled' ||
      !['local', 'twilio'].includes(driver) ||
      (driver === 'local' && process.env.NODE_ENV === 'production')
    )
      throw new ServiceUnavailableException('Connexion SMS non activée.');
    await this.limits.check('sms-ip:' + ip, 10, 3600);
    await this.limits.check('sms-phone:' + phone, 5, 3600);
    const id = randomUUID();
    if (!userId) return { challengeId: id, expiresIn: 300 };
    const code = String(randomInt(100000, 1000000));
    const row = await this.db.phoneChallenge.create({
      data: {
        id,
        userId,
        phone,
        purpose,
        codeHash: this.hash(id, code),
        expiresAt: new Date(Date.now() + 300000),
        delivery: this.keys.seal({
          phone,
          text: `Code TALA : ${code}. Valable 5 minutes. Ne partagez jamais ce code.`,
        }),
      },
    });
    if (driver === 'twilio') {
      const sid = process.env.TWILIO_ACCOUNT_SID || '',
        secret = process.env.TWILIO_AUTH_TOKEN,
        from = process.env.TWILIO_FROM;
      if (!/^AC[a-f0-9]{32}$/i.test(sid) || !secret || !from) {
        await this.db.phoneChallenge.update({
          where: { id },
          data: { consumedAt: new Date() },
        });
        throw new ServiceUnavailableException('SMS non configuré.');
      }
      try {
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              authorization:
                'Basic ' + Buffer.from(sid + ':' + secret).toString('base64'),
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: phone,
              From: from,
              Body: this.keys.open<{ text: string }>(row.delivery).text,
            }),
            signal: AbortSignal.timeout(10000),
            redirect: 'error',
          },
        );
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error('SMS');
        }
        await response.body?.cancel();
      } catch {
        await this.db.phoneChallenge.update({
          where: { id },
          data: { consumedAt: new Date() },
        });
        throw new ServiceUnavailableException('Envoi SMS indisponible.');
      }
    }
    await this.db.phoneChallenge.update({
      where: { id },
      data: { sentAt: new Date() },
    });
    return { challengeId: id, expiresIn: 300 };
  }
  async consume(
    id: string,
    code: string,
    purpose: string,
    expectedUser?: string,
    link = false,
  ) {
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PhoneChallenge" WHERE id=${id} FOR UPDATE`;
      const row = await tx.phoneChallenge.findUnique({ where: { id } });
      if (
        !row ||
        row.purpose !== purpose ||
        (expectedUser && row.userId !== expectedUser) ||
        row.consumedAt ||
        !row.sentAt ||
        row.expiresAt < new Date() ||
        row.attempts >= 5
      )
        return null;
      await tx.phoneChallenge.update({
        where: { id },
        data: { attempts: { increment: 1 } },
      });
      if (!equal(row.codeHash, this.hash(id, code))) return null;
      const user = await tx.user.findUnique({ where: { id: row.userId } });
      if (!user?.active || !user.emailVerified) return null;
      if (link) {
        if (
          await tx.user.count({
            where: { phone: row.phone, id: { not: user.id } },
          })
        )
          return { conflict: true as const };
        await tx.user.update({
          where: { id: user.id },
          data: { phone: row.phone },
        });
      } else if (user.phone !== row.phone) return null;
      await tx.phoneChallenge.update({
        where: { id },
        data: { consumedAt: new Date(), delivery: '' },
      });
      return { user };
    });
    if (!result)
      throw new UnauthorizedException('Code invalide, expiré ou déjà utilisé.');
    if ('conflict' in result)
      throw new ConflictException('Ce numéro est déjà associé à un compte.');
    return result.user;
  }
  async loginTarget(phone: string) {
    const user = await this.db.user.findUnique({ where: { phone } });
    return user?.active && user.emailVerified ? user.id : null;
  }
  async unlink(userId: string) {
    await this.db.user.update({ where: { id: userId }, data: { phone: null } });
    await this.db.phoneChallenge.deleteMany({ where: { userId } });
    return { removed: true };
  }
}
