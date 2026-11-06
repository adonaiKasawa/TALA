import { Controller } from '@nestjs/common';
import {
  Get,
  Post,
  Delete,
  Req,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { adapterFactory } from '../oidc/persistence/postgres.adapter.js';
import { token } from '../security/crypto.js';
import { checkCsrf } from '../security/http-security.js';
import type { AdapterPayload } from 'oidc-provider';
import { ConfigService } from '../config/config.service.js';
import { Database } from '../database/database.service.js';
import { KeysService } from '../keys/keys.service.js';
import { AuditService } from '../audit/audit.service.js';
import { OidcService } from '../oidc/oidc.service.js';

@Controller('admin')
export class ClientsController {
  constructor(
    private readonly config: ConfigService,
    private readonly db: Database,
    private readonly keys: KeysService,
    private readonly audit: AuditService,
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
  @Get('clients') async clients(@Req() req: Request) {
    await this.admin(req);
    return (
      await this.db.oidcArtifact.findMany({
        where: { model: 'Client' },
      })
    ).map((row) => {
      const metadata = this.keys.open<Record<string, unknown>>(row.payload);
      delete metadata.client_secret;
      return metadata;
    });
  }
  @Post('clients') async createClient(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { user } = await this.admin(req);
    const data = z
      .object({
        client_id: z.string().regex(/^[a-z0-9_-]{3,80}$/),
        client_name: z.string().min(1).max(100),
        kind: z.enum(['public', 'confidential', 'service']),
        application_type: z.enum(['web', 'native']).optional(),
        redirect_uris: z.array(z.url()).max(10).default([]),
        post_logout_redirect_uris: z.array(z.url()).max(10).default([]),
        scope: z.string().default('openid profile email tala.api'),
      })
      .parse(body);
    if (data.client_id === this.config.value.AUTH_REVIEW_CLIENT_ID)
      throw new BadRequestException('Client réservé.');
    const allowed = new Set([
      'openid',
      'profile',
      'email',
      'offline_access',
      'tala.api',
      'tala.identity',
      'tala.admin',
    ]);
    if (
      data.scope.split(' ').some((s) => !allowed.has(s)) ||
      (data.kind === 'service' &&
        /openid|offline_access|tala.identity|tala.admin/.test(data.scope)) ||
      (data.scope.split(' ').includes('tala.admin') &&
        !this.config.value.adminClientIds.includes(data.client_id))
    )
      throw new BadRequestException('Scopes interdits.');
    if (data.kind !== 'service' && !data.redirect_uris.length)
      throw new BadRequestException('URI de retour requise.');
    for (const uri of [
      ...data.redirect_uris,
      ...data.post_logout_redirect_uris,
    ]) {
      const url = new URL(uri);
      if (
        url.hash ||
        url.username ||
        url.password ||
        (!['https:', 'tala:'].includes(url.protocol) &&
          !(
            this.config.value.NODE_ENV !== 'production' &&
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(url.hostname)
          ))
      )
        throw new BadRequestException('URI non autorisée.');
    }
    const secret = data.kind !== 'public' ? token() : undefined;
    const metadata: AdapterPayload = {
      client_id: data.client_id,
      client_name: data.client_name,
      application_type:
        data.application_type ??
        (data.redirect_uris.some((uri) => new URL(uri).protocol === 'tala:')
          ? 'native'
          : 'web'),
      redirect_uris: data.redirect_uris,
      post_logout_redirect_uris: data.post_logout_redirect_uris,
      grant_types:
        data.kind === 'service'
          ? ['client_credentials']
          : ['authorization_code', 'refresh_token'],
      response_types: data.kind === 'service' ? [] : ['code'],
      token_endpoint_auth_method:
        data.kind === 'public' ? 'none' : 'client_secret_basic',
      client_secret: secret,
      scope: data.scope,
    };
    const Adapter = adapterFactory(this.db, this.keys);
    if (await new Adapter('Client').find(data.client_id))
      throw new BadRequestException('Client déjà présent.');
    await new Adapter('Client').upsert(data.client_id, metadata, 0);
    try {
      await this.oidc.provider.Client.find(data.client_id);
    } catch {
      await new Adapter('Client').destroy(data.client_id);
      throw new BadRequestException('Métadonnées client refusées.');
    }
    await this.audit.record('client.created', user.id, {
      client: data.client_id,
    });
    return metadata;
  }
  @Delete('clients/:id') async deleteClient(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const { user } = await this.admin(req);
    if (id === this.config.value.AUTH_REVIEW_CLIENT_ID)
      throw new BadRequestException('Client réservé.');
    const rows = await this.db.oidcArtifact.findMany({
      where: { model: 'Grant' },
    });
    for (const row of rows)
      if (this.keys.open<{ clientId?: string }>(row.payload).clientId === id) {
        await this.db.oidcArtifact.deleteMany({
          where: { OR: [{ model: 'Grant', id: row.id }, { grantId: row.id }] },
        });
      }
    await new (adapterFactory(this.db, this.keys))('Client').destroy(id);
    await this.audit.record('client.deleted', user.id, { client: id });
    return { message: 'Client supprimé.' };
  }
}
