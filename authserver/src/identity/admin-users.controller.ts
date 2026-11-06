import { Controller } from '@nestjs/common';
import {
  Get,
  Patch,
  Req,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { checkCsrf } from '../security/http-security.js';
import { publicUser } from './public-user.js';
import { ConfigService } from '../config/config.service.js';
import { Database } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { OidcService } from '../oidc/oidc.service.js';

@Controller('admin')
export class AdminUsersController {
  constructor(
    private readonly config: ConfigService,
    private readonly db: Database,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    private readonly oidc: OidcService,
  ) {}
  private async admin(req: Request) {
    if (
      !req.headers.authorization?.startsWith('Bearer ') &&
      !['GET', 'HEAD'].includes(req.method)
    )
      checkCsrf(req, this.config.value);
    return this.oidc.authenticate(req, true);
  }
  @Get('users') async users(@Req() req: Request) {
    await this.admin(req);
    return (
      await this.db.user.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
      })
    ).map(publicUser);
  }
  @Patch('users/:id') async updateUser(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { user: actor } = await this.admin(req);
    const data = z
      .object({
        active: z.boolean().optional(),
        role: z
          .enum([
            'user',
            'viewer',
            'creator',
            'professional',
            'moderator',
            'admin',
          ])
          .optional(),
      })
      .refine((v) => v.active !== undefined || v.role !== undefined)
      .parse(body);
    if (id === actor.id)
      throw new BadRequestException(
        'Modification de son propre rôle/statut interdite.',
      );
    const user = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74180327)`;
      const user = await tx.user.update({
        where: { id: z.uuid().parse(id) },
        data,
      });
      await tx.identityEvent.create({
        data: {
          subject: id,
          kind: 'state',
          role: user.role,
          active: user.active,
        },
      });
      return user;
    });
    await this.sessions.revokeUser(id);
    await this.audit.record('admin.user_updated', actor.id, { target: id });
    return publicUser(user);
  }
}
