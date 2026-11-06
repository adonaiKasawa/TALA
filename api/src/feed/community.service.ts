import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Principal } from '../auth/auth.metadata.js';
import { requireRole } from '../auth/permissions.js';
import { FeedService } from './feed.service.js';
import { profileVisibility } from './visibility.js';
import { lockActiveVideo } from '../videos/video-lock.js';

@Injectable()
export class CommunityService {
  constructor(private readonly feed: FeedService) {}
  private async me(actor: Principal) {
    return (await this.feed.viewer(actor, true))!;
  }
  async requests(actor: Principal) {
    const me = await this.me(actor);
    return this.feed.db.creatorRelation.findMany({
      where: {
        toId: me.id,
        kind: 'follow_request',
        from: { suspended: false },
      },
      select: {
        from: { select: { id: true, username: true, displayName: true } },
        createdAt: true,
      },
      take: 100,
      orderBy: [{ createdAt: 'asc' }, { fromId: 'asc' }],
    });
  }
  async decide(requester: string, accept: boolean, actor: Principal) {
    const me = await this.me(actor),
      db = this.feed.db;
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${[me.id, requester].sort().join('|')}, 0))`;
      const pending = await tx.creatorRelation.findUnique({
        where: {
          fromId_toId_kind: {
            fromId: requester,
            toId: me.id,
            kind: 'follow_request',
          },
        },
      });
      if (!pending) throw new NotFoundException('Demande introuvable.');
      if (accept) {
        const blocked = await tx.creatorRelation.count({
          where: {
            kind: 'block',
            OR: [
              { fromId: requester, toId: me.id },
              { fromId: me.id, toId: requester },
            ],
          },
        });
        const from = await tx.profile.findUnique({ where: { id: requester } });
        if (blocked || !from || from.suspended)
          throw new NotFoundException('Profil indisponible.');
        await tx.creatorRelation.upsert({
          where: {
            fromId_toId_kind: {
              fromId: requester,
              toId: me.id,
              kind: 'follow',
            },
          },
          create: { fromId: requester, toId: me.id, kind: 'follow' },
          update: {},
        });
      }
      await tx.creatorRelation.delete({
        where: {
          fromId_toId_kind: {
            fromId: requester,
            toId: me.id,
            kind: 'follow_request',
          },
        },
      });
    });
    return { accepted: accept };
  }
  async removeFollower(profileId: string, actor: Principal) {
    const me = await this.me(actor);
    await this.feed.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${[me.id, profileId].sort().join('|')}, 0))`;
      await tx.creatorRelation.deleteMany({
        where: {
          fromId: profileId,
          toId: me.id,
          kind: { in: ['follow', 'follow_request'] },
        },
      });
    });
    return { removed: true };
  }
  async pinVideo(id: string, rank: number | null, actor: Principal) {
    const me = await this.me(actor);
    await this.feed.videos.owned(id, actor);
    await this.feed.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${me.id}, 0))`;
      await lockActiveVideo(tx, id);
      const video = await tx.video.findUniqueOrThrow({ where: { id } });
      if (rank !== null && video.status !== 'published')
        throw new BadRequestException('Publiez la vidéo avant de l’épingler.');
      if (rank !== null)
        await tx.video.updateMany({
          where: { profileId: me.id, pinnedRank: rank },
          data: { pinnedRank: null },
        });
      await tx.video.update({ where: { id }, data: { pinnedRank: rank } });
    });
    return { pinnedRank: rank };
  }
  async profileVideos(
    username: string,
    tab: 'pinned' | 'reposts',
    actor?: Principal,
  ) {
    const me = await this.feed.viewer(actor);
    const profile = await this.feed.db.profile.findFirst({
      where: {
        username,
        ...profileVisibility(me?.id, await this.feed.exclusions(me?.id)),
      },
    });
    if (!profile) throw new NotFoundException('Profil indisponible.');
    const ids =
      tab === 'pinned'
        ? (
            await this.feed.db.video.findMany({
              where: {
                profileId: profile.id,
                pinnedRank: { not: null },
                status: 'published',
              },
              orderBy: { pinnedRank: 'asc' },
              select: { id: true },
              take: 3,
            })
          ).map((v) => v.id)
        : (
            await this.feed.db.repost.findMany({
              where: { profileId: profile.id },
              orderBy: [{ createdAt: 'desc' }, { videoId: 'desc' }],
              take: 100,
            })
          ).map((v) => v.videoId);
    return { items: await this.readableItems(ids, actor) };
  }
  async readableItems(ids: string[], actor?: Principal) {
    const items: unknown[] = [];
    for (const id of ids) {
      try {
        const v = await this.feed.requireReadable(id, actor);
        items.push({
          ...this.feed.videos.view(v),
          creator: v.profile
            ? {
                username: v.profile.username,
                displayName: v.profile.displayName,
                verified: !!v.profile.verifiedAt,
              }
            : null,
        });
      } catch (e) {
        if (!(e instanceof NotFoundException)) throw e;
      }
    }
    return items;
  }
  async repost(id: string, enabled: boolean, actor: Principal) {
    const me = await this.me(actor);
    if (!enabled) {
      await this.feed.db.repost.deleteMany({
        where: { profileId: me.id, videoId: id },
      });
      return { enabled };
    }
    const v = await this.feed.requireReadable(id, actor);
    if (v.visibility !== 'public' || v.profile?.isPrivate)
      throw new ForbiddenException(
        'Seules les vidéos publiques peuvent être republiées.',
      );
    await this.feed.db.$transaction(async (tx) => {
      await lockActiveVideo(tx, id);
      if (enabled)
        await tx.repost.upsert({
          where: { profileId_videoId: { profileId: me.id, videoId: id } },
          create: { profileId: me.id, videoId: id },
          update: {},
        });
      else
        await tx.repost.deleteMany({
          where: { profileId: me.id, videoId: id },
        });
    });
    return { enabled };
  }
  async collections(actor: Principal) {
    return this.feed.db.collection.findMany({
      where: { profileId: (await this.me(actor)).id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true },
    });
  }
  async createCollection(name: string, actor: Principal) {
    const me = await this.me(actor);
    return this.feed.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${me.id}, 0))`;
      if ((await tx.collection.count({ where: { profileId: me.id } })) >= 50)
        throw new BadRequestException('50 collections maximum.');
      if (
        await tx.collection.findUnique({
          where: { profileId_name: { profileId: me.id, name } },
        })
      )
        throw new ConflictException('Ce nom est déjà utilisé.');
      return tx.collection.create({
        data: { profileId: me.id, name },
        select: { id: true, name: true },
      });
    });
  }
  async collection(id: string, actor: Principal) {
    const row = await this.feed.db.collection.findFirst({
      where: { id, profileId: (await this.me(actor)).id },
    });
    if (!row) throw new NotFoundException();
    return {
      id,
      name: row.name,
      items: await this.readableItems(row.videos, actor),
    };
  }
  async collectionItem(
    id: string,
    videoId: string,
    enabled: boolean,
    actor: Principal,
  ) {
    const me = await this.me(actor);
    if (enabled) await this.feed.requireReadable(videoId, actor);
    await this.feed.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Collection" WHERE id=${id} FOR UPDATE`;
      const row = await tx.collection.findFirst({
        where: { id, profileId: me.id },
      });
      if (!row) throw new NotFoundException();
      const videos = row.videos.filter((v) => v !== videoId);
      if (enabled) videos.unshift(videoId);
      if (videos.length > 500)
        throw new BadRequestException('500 vidéos maximum par collection.');
      await tx.collection.update({ where: { id }, data: { videos } });
    });
    return { enabled };
  }
  async deleteCollection(id: string, actor: Principal) {
    await this.feed.db.collection.deleteMany({
      where: { id, profileId: (await this.me(actor)).id },
    });
    return { deleted: true };
  }
  async renameCollection(id: string, name: string, actor: Principal) {
    const me = await this.me(actor);
    try {
      const count = await this.feed.db.collection.updateMany({
        where: { id, profileId: me.id },
        data: { name },
      });
      if (!count.count) throw new NotFoundException();
      return { id, name };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('Nom déjà utilisé.');
      throw error;
    }
  }
  async replyContext(id: string, actor: Principal) {
    const video = await this.feed.requireReadable(id, actor);
    if (!video.replyToCommentId) return null;
    try {
      const { c } = await this.visibleComment(video.replyToCommentId, actor);
      return {
        commentId: c.id,
        videoId: c.videoId,
        text: c.text,
        author: {
          username: c.profile.username,
          displayName: c.profile.displayName,
        },
      };
    } catch (e) {
      if (e instanceof NotFoundException) return null;
      throw e;
    }
  }
  async visibleComment(id: string, actor: Principal) {
    const me = await this.me(actor);
    const c = await this.feed.db.videoComment.findUnique({
      where: { id },
      include: { profile: true },
    });
    if (!c) throw new NotFoundException();
    const v = await this.feed.requireReadable(c.videoId, actor);
    if (
      (await this.feed.exclusions(me.id)).includes(c.profileId) ||
      c.profile.suspended
    )
      throw new NotFoundException();
    if (c.profileId !== me.id) {
      const visible = await this.feed.db.profile.count({
        where: {
          ...profileVisibility(me.id),
          id: c.profileId,
          relationsTo: {
            none: { fromId: v.profileId || '', kind: 'restrict' },
          },
        },
      });
      if (!visible) throw new NotFoundException();
    }
    return { me, c, v };
  }
  async commentLike(id: string, enabled: boolean, actor: Principal) {
    const { me, c } = await this.visibleComment(id, actor);
    await this.feed.db.$transaction(async (tx) => {
      await lockActiveVideo(tx, c.videoId);
      if (enabled)
        await tx.commentLike.upsert({
          where: { profileId_commentId: { profileId: me.id, commentId: id } },
          create: { profileId: me.id, commentId: id },
          update: {},
        });
      else
        await tx.commentLike.deleteMany({
          where: { profileId: me.id, commentId: id },
        });
    });
    return {
      enabled,
      likes: await this.feed.db.commentLike.count({ where: { commentId: id } }),
    };
  }
  async pinComment(id: string, enabled: boolean, actor: Principal) {
    const { c, v, me } = await this.visibleComment(id, actor);
    if (v.profileId !== me.id) throw new NotFoundException();
    await this.feed.db.$transaction(async (tx) => {
      await lockActiveVideo(tx, c.videoId);
      if (enabled)
        await tx.videoComment.updateMany({
          where: { videoId: c.videoId, pinned: true },
          data: { pinned: false },
        });
      await tx.videoComment.update({
        where: { id },
        data: { pinned: enabled },
      });
    });
    return { pinned: enabled };
  }
  async replyVideo(commentId: string, videoId: string, actor: Principal) {
    const source = await this.visibleComment(commentId, actor);
    if (source.v.visibility !== 'public' || source.v.profile?.isPrivate)
      throw new ForbiddenException(
        'La réponse vidéo nécessite un commentaire de vidéo publique.',
      );
    await this.feed.videos.owned(videoId, actor);
    await this.feed.db.$transaction(async (tx) => {
      await lockActiveVideo(tx, videoId);
      await tx.video.update({
        where: { id: videoId },
        data: { replyToCommentId: commentId },
      });
    });
    return { videoId, replyToCommentId: commentId };
  }
  async verification(reason: string, proofUrls: string[], actor: Principal) {
    const me = await this.me(actor);
    return this.feed.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${me.id},0))`;
      const old = await tx.verificationRequest.findUnique({
        where: { profileId: me.id },
      });
      if (me.verifiedAt || old?.status === 'pending')
        throw new ConflictException('Demande déjà en cours ou profil vérifié.');
      return tx.verificationRequest.upsert({
        where: { profileId: me.id },
        create: { profileId: me.id, reason, proofUrls },
        update: {
          reason,
          proofUrls,
          status: 'pending',
          reviewReason: null,
          reviewedAt: null,
          reviewedBy: null,
          createdAt: new Date(),
        },
      });
    });
  }
  async myVerification(actor: Principal) {
    return this.feed.db.verificationRequest.findUnique({
      where: { profileId: (await this.me(actor)).id },
    });
  }
  async verificationQueue(actor: Principal) {
    requireRole(actor, ['moderator', 'admin'], true);
    return this.feed.db.verificationRequest.findMany({
      where: { status: 'pending' },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
  }
  async reviewVerification(
    id: string,
    approved: boolean,
    reason: string,
    actor: Principal,
  ) {
    requireRole(actor, ['moderator', 'admin'], true);
    return this.feed.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "VerificationRequest" WHERE id=${id} FOR UPDATE`;
      const request = await tx.verificationRequest.findUnique({
        where: { id },
      });
      if (!request || request.status !== 'pending')
        throw new ConflictException('Demande déjà traitée ou absente.');
      await tx.profile.update({
        where: { id: request.profileId },
        data: { verifiedAt: approved ? new Date() : null },
      });
      await tx.businessAudit.create({
        data: {
          actor: actor.issuer + '|' + actor.subject,
          action: 'verification.review',
          target: id,
          detail: { approved, reason },
        },
      });
      return tx.verificationRequest.update({
        where: { id },
        data: {
          status: approved ? 'approved' : 'rejected',
          reviewReason: reason,
          reviewedBy: actor.subject,
          reviewedAt: new Date(),
        },
      });
    });
  }
  async revokeVerification(
    profileId: string,
    reason: string,
    actor: Principal,
  ) {
    requireRole(actor, ['moderator', 'admin'], true);
    await this.feed.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "VerificationRequest" WHERE "profileId"=${profileId} FOR UPDATE`;
      const result = await tx.profile.updateMany({
        where: { id: profileId },
        data: { verifiedAt: null },
      });
      if (!result.count) throw new NotFoundException();
      await tx.verificationRequest.updateMany({
        where: { profileId },
        data: {
          status: 'revoked',
          reviewReason: reason,
          reviewedBy: actor.subject,
          reviewedAt: new Date(),
        },
      });
      await tx.businessAudit.create({
        data: {
          actor: actor.subject,
          action: 'verification.revoke',
          target: profileId,
          detail: { reason },
        },
      });
    });
    return { revoked: true };
  }
}
