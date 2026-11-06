import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Principal } from '../auth/auth.metadata.js';
import { FeedService } from './feed.service.js';
import { commentBody, cursorDecode, cursorEncode } from './feed.schema.js';
import { z } from 'zod';
import { lockActiveVideo } from '../videos/video-lock.js';
import { profileVisibility } from './visibility.js';

@Injectable()
export class SocialService {
  constructor(private readonly feed: FeedService) {}
  async summary(id: string, actor?: Principal) {
    const v = await this.feed.requireReadable(id, actor);
    const me = await this.feed.viewer(actor);
    const db = this.feed.db;
    const [likes, own, relations] = await Promise.all([
      db.videoReaction.count({ where: { videoId: id, kind: 'like' } }),
      me
        ? db.videoReaction.findMany({
            where: { videoId: id, profileId: me.id },
          })
        : Promise.resolve<{ kind: string }[]>([]),
      me && v.profileId
        ? db.creatorRelation.findMany({
            where: { fromId: me.id, toId: v.profileId },
          })
        : Promise.resolve<{ kind: string }[]>([]),
    ]);
    return {
      likes,
      liked: own.some((r) => r.kind === 'like'),
      saved: own.some((r) => r.kind === 'save'),
      following: relations.some((r) => r.kind === 'follow'),
      followRequested: relations.some((r) => r.kind === 'follow_request'),
      canInteract: !!me,
      own: me?.id === v.profileId,
      creator: v.profile
        ? {
            id: v.profile.id,
            username: v.profile.username,
            displayName: v.profile.displayName,
          }
        : null,
    };
  }
  async react(id: string, kind: string, enabled: boolean, actor: Principal) {
    await this.feed.requireReadable(id, actor);
    const me = (await this.feed.viewer(actor, true))!;
    const db = this.feed.db;
    await db.$transaction(async (tx) => {
      await lockActiveVideo(tx, id);
      if (enabled)
        await tx.videoReaction.upsert({
          where: {
            profileId_videoId_kind: { profileId: me.id, videoId: id, kind },
          },
          create: { profileId: me.id, videoId: id, kind },
          update: {},
        });
      else
        await tx.videoReaction.deleteMany({
          where: { profileId: me.id, videoId: id, kind },
        });
    });
    return { enabled };
  }
  async relate(
    username: string,
    kind: string,
    enabled: boolean,
    actor: Principal,
  ) {
    const me = (await this.feed.viewer(actor, true))!;
    const db = this.feed.db;
    const target = await db.profile.findUnique({ where: { username } });
    if (!target || target.suspended)
      throw new NotFoundException('Profil introuvable.');
    if (target.id === me.id)
      throw new BadRequestException('Cette action concerne un autre créateur.');
    // Serialize opposite-direction follow/block races on the same pair.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${[me.id, target.id].sort().join('|')}, 0))`;
      if (enabled && kind === 'follow') {
        const freshTarget = await tx.profile.findUniqueOrThrow({
          where: { id: target.id },
        });
        const accepted = await tx.creatorRelation.count({
          where: { fromId: me.id, toId: target.id, kind: 'follow' },
        });
        if (freshTarget.isPrivate && !accepted) kind = 'follow_request';
        const blocked = await tx.creatorRelation.count({
          where: {
            kind: 'block',
            OR: [
              { fromId: me.id, toId: target.id },
              { fromId: target.id, toId: me.id },
            ],
          },
        });
        if (blocked) throw new NotFoundException('Profil indisponible.');
      }
      if (enabled)
        await tx.creatorRelation.upsert({
          where: { fromId_toId_kind: { fromId: me.id, toId: target.id, kind } },
          create: { fromId: me.id, toId: target.id, kind },
          update: {},
        });
      else
        await tx.creatorRelation.deleteMany({
          where: {
            fromId: me.id,
            toId: target.id,
            kind:
              kind === 'follow' ? { in: ['follow', 'follow_request'] } : kind,
          },
        });
      if (enabled && kind === 'block')
        await tx.creatorRelation.deleteMany({
          where: {
            kind: { in: ['follow', 'follow_request'] },
            OR: [
              { fromId: me.id, toId: target.id },
              { fromId: target.id, toId: me.id },
            ],
          },
        });
      if (enabled && kind === 'follow')
        await tx.creatorRelation.deleteMany({
          where: { fromId: me.id, toId: target.id, kind: 'follow_request' },
        });
    });
    return { enabled, pending: kind === 'follow_request' };
  }
  async controls(actor: Principal) {
    const me = (await this.feed.viewer(actor, true))!;
    const rows = await this.feed.db.creatorRelation.findMany({
      where: { fromId: me.id, kind: { in: ['block', 'mute', 'restrict'] } },
      include: { to: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const hidden = await this.feed.db.videoReaction.findMany({
      where: {
        profileId: me.id,
        kind: 'not_interested',
        video: {
          status: 'published',
          visibility: 'public',
          profile: {
            isPrivate: false,
            id: { notIn: await this.feed.exclusions(me.id) },
          },
        },
      },
      include: { video: { include: { profile: true } } },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: [
        ...rows.map((r) => ({
          username: r.to.username,
          displayName: r.to.displayName,
          kind: r.kind,
        })),
        ...hidden.map((r) => ({
          videoId: r.videoId,
          title: r.video.title,
          username: r.video.profile!.username,
          displayName: r.video.profile!.displayName,
          kind: r.kind,
        })),
      ],
    };
  }
  async connections(
    username: string,
    kind: 'followers' | 'following',
    actor?: Principal,
  ) {
    const db = this.feed.db;
    const p = await db.profile.findUnique({ where: { username } });
    const me = await this.feed.viewer(actor);
    if (
      !p ||
      p.suspended ||
      (p.isPrivate &&
        p.id !== me?.id &&
        !(await db.creatorRelation.count({
          where: { fromId: me?.id || '', toId: p.id, kind: 'follow' },
        }))) ||
      (await this.feed.exclusions(me?.id)).includes(p.id)
    )
      throw new NotFoundException('Profil indisponible.');
    const excluded = await this.feed.exclusions(me?.id);
    const where =
      kind === 'followers'
        ? { toId: p.id, from: profileVisibility(me?.id, excluded) }
        : { fromId: p.id, to: profileVisibility(me?.id, excluded) };
    const [total, rows] = await Promise.all([
      db.creatorRelation.count({ where: { ...where, kind: 'follow' } }),
      db.creatorRelation.findMany({
        where: { ...where, kind: 'follow' },
        include: { from: true, to: true },
        orderBy: [{ createdAt: 'desc' }, { fromId: 'desc' }],
        take: 100,
      }),
    ]);
    return {
      total,
      items: rows.map((r) => {
        const q = kind === 'followers' ? r.from : r.to;
        return { username: q.username, displayName: q.displayName };
      }),
    };
  }
  async comments(id: string, cursor: string | undefined, actor?: Principal) {
    const v = await this.feed.requireReadable(id, actor);
    const me = await this.feed.viewer(actor);
    const excluded = await this.feed.exclusions(me?.id);
    const after = cursorDecode(cursor, id);
    const rows = await this.feed.db.videoComment.findMany({
      where: {
        videoId: id,
        profileId: { notIn: excluded },
        AND: [
          {
            OR: [
              ...(me ? [{ profileId: me.id }] : []),
              {
                profile: {
                  ...profileVisibility(me?.id),
                  relationsTo: {
                    none: { fromId: v.profileId || '', kind: 'restrict' },
                  },
                },
              },
            ],
          },
          ...(after
            ? [
                {
                  OR: [
                    { createdAt: { gt: new Date(after.at) } },
                    { createdAt: new Date(after.at), id: { gt: after.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      include: {
        profile: true,
        _count: { select: { likes: true } },
        likes: {
          where: { profileId: me?.id || '' },
          select: { profileId: true },
          take: 1,
        },
        videoReplies: {
          where: {
            status: 'published',
            visibility: 'public',
            profile: profileVisibility(me?.id, excluded),
          },
          select: { id: true, title: true },
          take: 10,
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 31,
    });
    const items = rows.slice(0, 30),
      last = items.at(-1);
    return {
      items: items.map((c) => ({
        id: c.id,
        text: c.text,
        parentId: c.parentId,
        pinned: c.pinned,
        likes: c._count.likes,
        liked: c.likes.length > 0,
        videoReplies: c.videoReplies,
        createdAt: c.createdAt,
        author: {
          username: c.profile.username,
          displayName: c.profile.displayName,
        },
        canDelete: c.profileId === me?.id || v.profileId === me?.id,
      })),
      nextCursor:
        rows.length > 30 && last
          ? cursorEncode(last.id, last.createdAt, id)
          : null,
    };
  }
  async comment(
    id: string,
    body: z.infer<typeof commentBody>,
    actor: Principal,
  ) {
    const video = await this.feed.requireReadable(id, actor);
    const me = (await this.feed.viewer(actor, true))!;
    if (body.parentId) {
      const parent = await this.feed.db.videoComment.findUnique({
        where: { id: body.parentId },
        include: { profile: true },
      });
      if (!parent || parent.videoId !== id || parent.parentId)
        throw new BadRequestException(
          'Réponse limitée à un commentaire de cette vidéo.',
        );
      const excluded = await this.feed.exclusions(me.id);
      const restricted = await this.feed.db.creatorRelation.count({
        where: {
          fromId: video.profileId || '',
          toId: parent.profileId,
          kind: 'restrict',
        },
      });
      const visibleParent = await this.feed.db.profile.count({
        where: { ...profileVisibility(me.id), id: parent.profileId },
      });
      if (
        excluded.includes(parent.profileId) ||
        (parent.profileId !== me.id && (!visibleParent || restricted))
      )
        throw new NotFoundException();
    }
    const row = await this.feed.db.$transaction(async (tx) => {
      await lockActiveVideo(tx, id);
      return tx.videoComment.create({
        data: {
          videoId: id,
          profileId: me.id,
          text: body.text,
          parentId: body.parentId,
        },
      });
    });
    return { id: row.id };
  }
  async removeComment(id: string, commentId: string, actor: Principal) {
    const v = await this.feed.requireReadable(id, actor);
    const me = (await this.feed.viewer(actor, true))!;
    const c = await this.feed.db.videoComment.findUnique({
      where: { id: commentId },
    });
    if (
      !c ||
      c.videoId !== id ||
      (c.profileId !== me.id && v.profileId !== me.id)
    )
      throw new NotFoundException();
    await this.feed.db.videoComment.delete({ where: { id: commentId } });
    return { deleted: true };
  }
}
