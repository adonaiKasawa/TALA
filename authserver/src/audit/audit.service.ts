import { Injectable } from '@nestjs/common';
import { Database } from '../database/database.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly db: Database) {}

  record(event: string, userId?: string, detail: Record<string, string> = {}) {
    return this.db.auditEvent.create({ data: { event, userId, detail } });
  }
}
