import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { Database } from '../database/database.service.js';
import { ConfigService } from '../config/config.service.js';
const event = z.object({
  sequence: z.string().regex(/^\d+$/),
  subject: z.uuid(),
  role: z.string(),
  active: z.boolean(),
  kind: z.enum(['state', 'deleted']),
  createdAt: z.string(),
});
@Injectable()
export class IdentitySyncService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    private readonly db: Database,
    private readonly config: ConfigService,
  ) {}
  async request(path: string, method = 'GET', body?: unknown) {
    const key = process.env.IDENTITY_SYNC_KEY;
    if (!key || !/^[a-f0-9]{64}$/i.test(key))
      throw new ServiceUnavailableException(
        'Synchronisation identité non configurée.',
      );
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', Buffer.from(key, 'hex'))
      .update(`${method}\n${path}\n${timestamp}\n${JSON.stringify(body || {})}`)
      .digest('hex');
    const res = await fetch(new URL(path, this.config.value.OIDC_ISSUER), {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        'x-tala-time': timestamp,
        'x-tala-signature': signature,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      signal: AbortSignal.timeout(4000),
      redirect: 'error',
    });
    if (!res.ok)
      throw new ServiceUnavailableException(
        'Identité temporairement indisponible.',
      );
    return res.json() as Promise<unknown>;
  }
  async live(subject: string, sid: string, gid: string) {
    const data = z
      .object({ active: z.boolean(), role: z.string() })
      .parse(
        await this.request(
          `/internal/identity-state/${encodeURIComponent(subject)}?sid=${encodeURIComponent(sid)}&gid=${encodeURIComponent(gid)}`,
        ),
      );
    if (!data.active)
      throw new UnauthorizedException('Compte ou session indisponible.');
    return data;
  }
  async consumeWithdrawalProof(
    subject: string,
    proof: string,
    contextHash: string,
  ) {
    return z
      .object({
        authorized: z.literal(true),
        subject: z.literal(subject),
        purpose: z.literal('withdrawal'),
        contextHash: z.literal(contextHash),
      })
      .parse(
        await this.request('/internal/step-up/consume', 'POST', {
          subject,
          proof,
          contextHash,
          purpose: 'withdrawal',
        }),
      );
  }
  onModuleInit() {
    if (!process.env.IDENTITY_SYNC_KEY) return;
    this.timer = setInterval(() => void this.poll().catch(() => {}), 2000);
    this.timer.unref();
    void this.poll().catch(() => {});
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async poll() {
    if (this.running) return;
    this.running = true;
    try {
      const issuer = this.config.value.OIDC_ISSUER;
      const cursor = await this.db.identitySync.findUnique({
        where: { issuer },
      });
      const rows = z
        .array(event)
        .max(100)
        .parse(
          await this.request(
            '/internal/identity-events?after=' + (cursor?.sequence || 0n),
          ),
        );
      for (const row of rows)
        await this.db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${issuer}, 0))`;
          const latest = await tx.identitySync.findUnique({
            where: { issuer },
          });
          if (latest && latest.sequence >= BigInt(row.sequence)) return;
          const deleted = row.kind === 'deleted';
          await tx.accountState.upsert({
            where: { issuer_subject: { issuer, subject: row.subject } },
            create: {
              issuer,
              subject: row.subject,
              role: row.role,
              active: row.active,
              deleted,
              sequence: BigInt(row.sequence),
            },
            update: {
              role: row.role,
              active: row.active,
              deleted,
              sequence: BigInt(row.sequence),
            },
          });
          if (deleted) {
            await tx.video.updateMany({
              where: {
                issuer,
                subject: row.subject,
                status: { not: 'deleted' },
              },
              data: { status: 'deleted', publishedAt: null },
            });
            await tx.videoReaction.deleteMany({
              where: { video: { issuer, subject: row.subject } },
            });
            await tx.videoComment.deleteMany({
              where: { video: { issuer, subject: row.subject } },
            });
            await tx.watchSession.deleteMany({
              where: { video: { issuer, subject: row.subject } },
            });
            await tx.videoCaption.deleteMany({
              where: { video: { issuer, subject: row.subject } },
            });
            await tx.profile.deleteMany({
              where: { issuer, subject: row.subject },
            });
            await tx.sound.updateMany({
              where: { creatorIssuer: issuer, creatorSubject: row.subject },
              data: {
                creatorIssuer: 'deleted',
                creatorSubject: 'deleted',
                label: 'Son original',
              },
            });
          } else
            await tx.profile.updateMany({
              where: { issuer, subject: row.subject },
              data: { suspended: !row.active },
            });
          await tx.identitySync.upsert({
            where: { issuer },
            create: { issuer, sequence: BigInt(row.sequence) },
            update: { sequence: BigInt(row.sequence) },
          });
        });
    } finally {
      this.running = false;
    }
  }
}
