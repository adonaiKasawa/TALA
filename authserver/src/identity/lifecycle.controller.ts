import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Database } from '../database/database.service.js';
import { KeysService } from '../keys/keys.service.js';
import { digest } from '../security/crypto.js';

@Controller('internal')
export class LifecycleController {
  constructor(
    private readonly db: Database,
    private readonly keys: KeysService,
  ) {}
  private check(req: Request) {
    const key = process.env.IDENTITY_SYNC_KEY;
    const timestamp = req.header('x-tala-time') || '';
    const supplied = req.header('x-tala-signature') || '';
    if (
      !key ||
      !/^[a-f0-9]{64}$/i.test(key) ||
      !/^\d{13}$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp)) > 60000 ||
      !/^[a-f0-9]{64}$/.test(supplied)
    )
      throw new UnauthorizedException();
    const expected = createHmac('sha256', Buffer.from(key, 'hex'))
      .update(
        `${req.method}\n${req.originalUrl}\n${timestamp}\n${JSON.stringify(req.body || {})}`,
      )
      .digest('hex');
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)))
      throw new UnauthorizedException();
  }
  @Get('identity-events') async events(
    @Req() req: Request,
    @Query('after') after: unknown,
  ) {
    this.check(req);
    const sequence = BigInt(
      z
        .string()
        .regex(/^\d{1,19}$/)
        .parse(after ?? '0'),
    );
    return (
      await this.db.identityEvent.findMany({
        where: { sequence: { gt: sequence } },
        orderBy: { sequence: 'asc' },
        take: 100,
      })
    ).map((e) => ({ ...e, sequence: String(e.sequence) }));
  }
  @Post('step-up/consume') async consume(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    this.check(req);
    const data = z
      .object({
        proof: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        subject: z.uuid(),
        purpose: z.literal('withdrawal'),
        contextHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(body);
    const id = digest(data.proof);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OidcArtifact" WHERE model='StepUp' AND id=${id} FOR UPDATE`;
      const row = await tx.oidcArtifact.findUnique({
        where: { model_id: { model: 'StepUp', id } },
      });
      if (
        !row ||
        row.accountId !== data.subject ||
        row.consumedAt ||
        !row.expiresAt ||
        row.expiresAt < new Date()
      )
        throw new UnauthorizedException('Preuve expirée ou déjà utilisée.');
      const saved = this.keys.open<{
        purpose: string;
        contextHash: string;
        sid: string;
        gid: string;
      }>(row.payload);
      if (
        saved.purpose !== data.purpose ||
        saved.contextHash !== data.contextHash
      )
        throw new UnauthorizedException('Preuve pour une autre opération.');
      const user = await tx.user.findUnique({ where: { id: data.subject } });
      const session = await tx.oidcArtifact.count({
        where: {
          model: 'Session',
          uid: saved.sid,
          accountId: data.subject,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      const grant = await tx.oidcArtifact.count({
        where: {
          model: 'Grant',
          id: saved.gid,
          accountId: data.subject,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!user?.active || !user.mfaEnabled || !session || !grant)
        throw new UnauthorizedException();
      await tx.oidcArtifact.update({
        where: { model_id: { model: 'StepUp', id } },
        data: { consumedAt: new Date() },
      });
      return {
        authorized: true,
        subject: data.subject,
        purpose: data.purpose,
        contextHash: data.contextHash,
      };
    });
  }
  @Get('identity-state/:id') async state(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('sid') sid: string,
    @Query('gid') gid: string,
  ) {
    this.check(req);
    const user = await this.db.user.findUnique({
      where: { id: z.uuid().parse(id) },
    });
    if (!user) return { active: false, role: 'viewer' };
    const expires = {
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
    const [session, grant] = await Promise.all([
      this.db.oidcArtifact.findFirst({
        where: { model: 'Session', uid: sid, accountId: id, ...expires },
      }),
      this.db.oidcArtifact.findFirst({
        where: { model: 'Grant', id: gid, accountId: id, ...expires },
      }),
    ]);
    return {
      active: user.active && user.emailVerified && !!session && !!grant,
      role: user.role,
    };
  }
}
