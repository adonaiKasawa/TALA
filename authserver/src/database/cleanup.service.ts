import { Injectable } from '@nestjs/common';

import { Database } from './database.service.js';
@Injectable()
export class CleanupService {
  constructor(private readonly db: Database) {}
  async cleanup() {
    await this.db.phoneChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const old = new Date(Date.now() - 30 * 86400000);
    await this.db.oidcArtifact.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await this.db.accountAction.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await this.db.federationAttempt.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await this.db.rateBucket.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await this.db.mail.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 86400000) } },
    });
    await this.db.auditEvent.deleteMany({ where: { createdAt: { lt: old } } });
  }
}
