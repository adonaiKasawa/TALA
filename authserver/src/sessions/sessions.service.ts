import { Injectable, BadRequestException } from '@nestjs/common';
import { Database } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
@Injectable()
export class SessionsService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
  ) {}
  async revokeUser(userId: string) {
    await this.db.oidcArtifact.deleteMany({ where: { accountId: userId } });
  }
  async sessions(userId: string, currentUid?: string) {
    const rows = await this.db.oidcArtifact.findMany({
      where: {
        model: 'Session',
        accountId: userId,
        expiresAt: { gt: new Date() },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      expiresAt: r.expiresAt,
      current: r.uid === currentUid,
    }));
  }
  async revokeSession(userId: string, id: string) {
    const db = this.db;
    const row = await db.oidcArtifact.findFirst({
      where: { model: 'Session', id, accountId: userId },
    });
    if (!row) throw new BadRequestException('Session inconnue.');
    const tokens = await db.oidcArtifact.findMany({
      where: { sessionUid: row.uid },
    });
    for (const grantId of new Set(
      tokens.map((t) => t.grantId).filter(Boolean),
    )) {
      await db.oidcArtifact.deleteMany({
        where: { OR: [{ model: 'Grant', id: grantId! }, { grantId }] },
      });
    }
    await db.oidcArtifact.deleteMany({
      where: { OR: [{ model: 'Session', id }, { sessionUid: row.uid }] },
    });
    await this.audit.record('session.revoked', userId);
    return { message: 'Session révoquée.' };
  }
}
