import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  NotFoundException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../auth/auth.metadata.js';
import { FeedService } from './feed.service.js';
import { CommunityService } from './community.service.js';

@Controller()
export class SpaceController {
  constructor(
    private readonly feed: FeedService,
    private readonly community: CommunityService,
  ) {}
  private async me(actor: Principal) {
    const me = (await this.feed.viewer(actor, true))!;
    if (me.suspended) throw new NotFoundException('Compte indisponible.');
    return me;
  }
  @Get('me/library') async library(
    @Query('tab') raw: unknown,
    @CurrentPrincipal() actor: Principal,
  ) {
    const tab = z
        .enum(['videos', 'reposts', 'favorites'])
        .default('videos')
        .parse(raw),
      me = await this.me(actor),
      db = this.feed.db;
    const [videos, reposts, favorites, followers, following] =
      await Promise.all([
        db.video.count({ where: { profileId: me.id, status: 'published' } }),
        db.repost.count({ where: { profileId: me.id } }),
        db.videoReaction.count({ where: { profileId: me.id, kind: 'save' } }),
        db.creatorRelation.count({ where: { toId: me.id, kind: 'follow' } }),
        db.creatorRelation.count({ where: { fromId: me.id, kind: 'follow' } }),
      ]);
    const ids =
      tab === 'videos'
        ? (
            await db.video.findMany({
              where: {
                profileId: me.id,
                status: { in: ['ready', 'published'] },
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 100,
              select: { id: true },
            })
          ).map((v) => v.id)
        : tab === 'reposts'
          ? (
              await db.repost.findMany({
                where: { profileId: me.id },
                orderBy: [{ createdAt: 'desc' }, { videoId: 'desc' }],
                take: 100,
              })
            ).map((v) => v.videoId)
          : (
              await db.videoReaction.findMany({
                where: { profileId: me.id, kind: 'save' },
                orderBy: [{ createdAt: 'desc' }, { videoId: 'desc' }],
                take: 100,
              })
            ).map((v) => v.videoId);
    const readable = (await this.community.readableItems(ids, actor)) as {
      id: string;
    }[];
    return {
      stats: { videos, reposts, favorites, followers, following },
      items: readable,
      limit: 100,
      viewScope: 'cumulative',
    };
  }
  private async allowed(meId: string, peerId: string, requireFollow = false) {
    const db = this.feed.db;
    const peer = await db.profile.findFirst({
      where: { id: peerId, suspended: false },
    });
    const blocked = await db.creatorRelation.count({
      where: {
        OR: [
          { fromId: meId, toId: peerId },
          { fromId: peerId, toId: meId },
        ],
        kind: { in: ['block', 'restrict'] },
      },
    });
    if (!peer || blocked)
      throw new NotFoundException('Conversation indisponible.');
    if (
      requireFollow &&
      peer.isPrivate &&
      !(await db.creatorRelation.count({
        where: { fromId: meId, toId: peerId, kind: 'follow' },
      }))
    )
      throw new NotFoundException(
        'Abonnez-vous à ce compte privé avant de lui écrire.',
      );
    return peer;
  }
  private async thread(id: string, actor: Principal) {
    const me = await this.me(actor),
      t = await this.feed.db.directThread.findFirst({
        where: {
          id: z.uuid().parse(id),
          OR: [{ leftId: me.id }, { rightId: me.id }],
        },
      });
    if (!t) throw new NotFoundException('Conversation indisponible.');
    const peer = await this.allowed(
      me.id,
      t.leftId === me.id ? t.rightId : t.leftId,
    );
    return { me, t, peer };
  }
  @Get('me/conversations') async inbox(@CurrentPrincipal() actor: Principal) {
    const me = await this.me(actor);
    const controls = await this.feed.db.creatorRelation.findMany({
      where: {
        OR: [{ fromId: me.id }, { toId: me.id }],
        kind: { in: ['block', 'restrict'] },
      },
    });
    const excluded = controls.map((r) =>
      r.fromId === me.id ? r.toId : r.fromId,
    );
    const rows = await this.feed.db.directThread.findMany({
      where: {
        OR: [
          { leftId: me.id, rightId: { notIn: excluded } },
          { rightId: me.id, leftId: { notIn: excluded } },
        ],
        left: { suspended: false },
        right: { suspended: false },
      },
      include: {
        left: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        right: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const unread = await this.feed.db.directMessage.groupBy({
      by: ['threadId'],
      where: {
        threadId: { in: rows.map((t) => t.id) },
        senderId: { not: me.id },
        readAt: null,
      },
      _count: { _all: true },
    });
    return {
      items: rows.map((t) => ({
        id: t.id,
        peer: t.leftId === me.id ? t.right : t.left,
        last: t.messages[0] || null,
        unread: unread.find((r) => r.threadId === t.id)?._count._all || 0,
      })),
    };
  }
  @Post('me/conversations') async open(
    @Body() body: unknown,
    @CurrentPrincipal() actor: Principal,
  ) {
    const { username } = z
        .object({ username: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/) })
        .strict()
        .parse(body),
      me = await this.me(actor),
      peer = await this.feed.db.profile.findUnique({ where: { username } });
    if (!peer || peer.id === me.id)
      throw new BadRequestException('Choisissez un autre créateur.');
    await this.allowed(me.id, peer.id, true);
    const [leftId, rightId] = [me.id, peer.id].sort();
    return this.feed.db.directThread.upsert({
      where: { pairKey: leftId + ':' + rightId },
      create: { pairKey: leftId + ':' + rightId, leftId, rightId },
      update: {},
      select: { id: true },
    });
  }
  @Get('conversations/:id/messages') async messages(
    @Param('id') id: string,
    @Query('before') raw: unknown,
    @CurrentPrincipal() actor: Principal,
  ) {
    const { me, t, peer } = await this.thread(id, actor),
      before = z.uuid().optional().parse(raw);
    if (
      before &&
      !(await this.feed.db.directMessage.count({
        where: { id: before, threadId: t.id },
      }))
    )
      throw new NotFoundException();
    const rows = await this.feed.db.directMessage.findMany({
      where: { threadId: t.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });
    return {
      me: me.id,
      peer: {
        id: peer.id,
        username: peer.username,
        displayName: peer.displayName,
        avatarUrl: peer.avatarUrl,
      },
      items: rows.slice(0, 50).reverse(),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    };
  }
  @Put('conversations/:id/read') async read(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    const { me, t } = await this.thread(id, actor);
    await this.feed.db.directMessage.updateMany({
      where: { threadId: t.id, senderId: { not: me.id }, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: true };
  }
  @Post('conversations/:id/messages') async write(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() actor: Principal,
  ) {
    const data = z
        .object({
          text: z.string().trim().min(1).max(2000),
          clientId: z.uuid(),
        })
        .strict()
        .parse(body),
      { me, t } = await this.thread(id, actor);
    await this.allowed(me.id, t.leftId === me.id ? t.rightId : t.leftId, true);
    return this.feed.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'message:' + me.id},0))`;
      const existing = await tx.directMessage.findUnique({
        where: {
          threadId_senderId_clientId: {
            threadId: t.id,
            senderId: me.id,
            clientId: data.clientId,
          },
        },
      });
      if (existing) return existing;
      if (
        (await tx.directMessage.count({
          where: {
            senderId: me.id,
            createdAt: { gt: new Date(Date.now() - 60000) },
          },
        })) >= 20
      )
        throw new HttpException(
          'Patientez avant d’envoyer un nouveau message.',
          429,
        );
      const message = await tx.directMessage.create({
        data: { threadId: t.id, senderId: me.id, ...data },
      });
      await tx.directThread.update({
        where: { id: t.id },
        data: { updatedAt: new Date() },
      });
      return message;
    });
  }
}
