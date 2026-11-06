import { Injectable } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { Database } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CredentialsService } from '../credentials/credentials.service.js';
@Injectable()
export class IdentityService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
    private readonly credentials: CredentialsService,
  ) {}
  async register(email: string, username: string, password: string) {
    const passwordHash = await hash(password, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    try {
      const user = await this.db.user.create({
        data: { email: email.toLowerCase(), username, passwordHash },
      });
      await this.credentials.action(user, 'verify');
      await this.audit.record('account.registered', user.id);
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
    return {
      message:
        'Si les informations sont disponibles, un email de vérification a été envoyé.',
    };
  }
}
