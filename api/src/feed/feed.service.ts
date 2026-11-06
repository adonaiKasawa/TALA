import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Database } from '../database/database.service.js';
import type { Principal } from '../auth/auth.metadata.js';
import type { Prisma } from '../generated/prisma/client.js';
import { VideosService } from '../videos/videos.service.js';
import { cursorDecode, cursorEncode, feedQuery } from './feed.schema.js';
import { z } from 'zod';
import { profileVisibility } from './visibility.js';

@Injectable()
export class FeedService {
  constructor(
    readonly db: Database,
    readonly videos: VideosService,
  ) {}
  async viewer(actor?: Principal, required = false) {
    const p = actor
      ? await this.db.profile.findUnique({
          where: {
            issuer_subject: { issuer: actor.issuer, subject: actor.subject },
          },
        })
      : null;
    if (!p && required)
      throw new UnauthorizedException(
        'Connectez-vous et complétez votre profil.',
      );
    return p;
  }
  async exclusions(profileId?: string, includeMuted = true) {
    if (!profileId) return [];
    const rows = await this.db.creatorRelation.findMany({
      where: {
        OR: [
          {
            fromId: profileId,
            kind: { in: includeMuted ? ['block', 'mute'] : ['block'] },
          },
          { toId: profileId, kind: 'block' },
        ],
      },
    });
    return rows.map((r) => (r.fromId === profileId ? r.toId : r.fromId));
  }
  async page(input: z.infer<typeof feedQuery>, actor?: Principal) {
    this.videos.enabled();
    const viewer = await this.viewer(actor, input.mode !== 'latest');
    const scope = JSON.stringify([
      input.kind,
      input.mode,
      input.creator || '',
      input.video || '',
      input.tag?.toLowerCase() || '',
      input.category || '',
      input.language || '',
      input.country || '',
    ]);
    const cursor = cursorDecode(input.cursor, scope);
    const excluded = await this.exclusions(viewer?.id);
    const where: Prisma.VideoWhereInput = {
      status: 'published',
      visibility: 'public',
      kind: input.kind,
      ...(input.category ? { category: input.category } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.country ? { country: input.country } : {}),
      ...(!input.creator && !input.video ? { trial: false } : {}),
      ...(input.video ? { id: input.video } : {}),
      profile: {
        ...profileVisibility(viewer?.id, excluded),
        ...(input.creator ? { username: input.creator } : {}),
        ...(input.mode === 'following'
          ? { relationsTo: { some: { fromId: viewer!.id, kind: 'follow' } } }
          : {}),
      },
      ...(input.tag ? { hashtags: { has: input.tag.toLowerCase() } } : {}),
      ...(viewer
        ? {
            reactions: {
              none: { profileId: viewer.id, kind: 'not_interested' },
            },
          }
        : {}),
      ...(input.mode === 'saved'
        ? {
            AND: [
              { reactions: { some: { profileId: viewer!.id, kind: 'save' } } },
            ],
          }
        : {}),
      ...(cursor
        ? {
            OR: [
              { publishedAt: { lt: new Date(cursor.at) } },
              { publishedAt: new Date(cursor.at), id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const rows = await this.db.video.findMany({
      where,
      include: { profile: true },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    return {
      items: items.map((v) => ({
        ...this.videos.view(v),
        hashtags: v.hashtags,
        creator: {
          id: v.profile!.id,
          username: v.profile!.username,
          displayName: v.profile!.displayName,
          avatarUrl: v.profile!.avatarUrl,
        },
        audio: { label: 'Son original', creator: v.profile!.username },
      })),
      nextCursor:
        rows.length > input.limit && last
          ? cursorEncode(last.id, last.publishedAt!, scope)
          : null,
      order: 'chronological',
    };
  }
  async requireReadable(id: string, actor?: Principal) {
    const video = await this.videos.readable(id, actor);
    const viewer = await this.viewer(actor);
    if (
      video.profileId &&
      (await this.exclusions(viewer?.id, false)).includes(video.profileId)
    )
      throw new NotFoundException('Vidéo indisponible.');
    return video;
  }
}
