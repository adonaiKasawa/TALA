import { Injectable } from '@nestjs/common';

import { ConfigService } from '../config/config.service.js';
import { Database } from '../database/database.service.js';
import { KeysService } from '../keys/keys.service.js';
import { AuditService } from '../audit/audit.service.js';
@Injectable()
export class MailService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: Database,
    private readonly keys: KeysService,
    private readonly audit: AuditService,
  ) {}
  async mailTick() {
    if (!this.config.value.SMTP_URL) return;
    const { createTransport } = await import('nodemailer');
    const transport = createTransport(this.config.value.SMTP_URL);
    for (const row of await this.db.mail.findMany({
      where: { sentAt: null, attempts: { lt: 5 } },
      take: 10,
      orderBy: { createdAt: 'asc' },
    })) {
      const claimed = await this.db.mail.updateMany({
        where: { id: row.id, attempts: row.attempts },
        data: { attempts: { increment: 1 } },
      });
      if (!claimed.count) continue;
      try {
        await transport.sendMail({
          from: this.config.value.MAIL_FROM,
          ...this.keys.open<object>(row.content),
        });
        await this.db.mail.update({
          where: { id: row.id },
          data: { sentAt: new Date() },
        });
      } catch {
        await this.audit.record('mail.delivery_failed');
      }
    }
    transport.close();
  }
}
