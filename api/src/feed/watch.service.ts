import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Principal } from '../auth/auth.metadata.js';
import { FeedService } from './feed.service.js';
import { impressionBody, watchBody } from './feed.schema.js';
import { z } from 'zod';
import { lockActiveVideo } from '../videos/video-lock.js';
import { rankingFeatures } from './ranking.js';
import { profileVisibility } from './visibility.js';

@Injectable()
export class WatchService implements OnModuleInit, OnModuleDestroy {
  private cleanup?: ReturnType<typeof setInterval>;
  constructor(private readonly feed: FeedService) {}
  onModuleInit() {
    this.cleanup = setInterval(() => {
      void this.feed.db.watchSession
        .deleteMany({
          where: { updatedAt: { lt: new Date(Date.now() - 90 * 86400000) } },
        })
        .catch(() => {});
    }, 3600000);
    this.cleanup.unref();
  }
  onModuleDestroy() {
    clearInterval(this.cleanup);
  }
  async impression(body: z.infer<typeof impressionBody>, actor: Principal) {
    const video = await this.feed.requireReadable(body.videoId, actor);
    const me = (await this.feed.viewer(actor, true))!;
    const following = video.profileId
      ? await this.feed.db.creatorRelation.count({
          where: { fromId: me.id, toId: video.profileId, kind: 'follow' },
        })
      : 0;
    const followers = video.profileId
      ? await this.feed.db.creatorRelation.count({
          where: { toId: video.profileId, kind: 'follow' },
        })
      : 0;
    return this.feed.db.$transaction(async (tx) => {
      await lockActiveVideo(tx, body.videoId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'watch:' + body.id},0))`;
      const previous = await tx.watchSession.findUnique({
        where: { id: body.id },
      });
      if (
        previous &&
        (previous.profileId !== me.id || previous.videoId !== body.videoId)
      )
        throw new NotFoundException();
      const row =
        previous ||
        (await tx.watchSession.create({
          data: {
            id: body.id,
            videoId: body.videoId,
            surface: body.surface,
            profileId: me.id,
            features: rankingFeatures(me, video, following > 0, followers < 10),
          },
        }));
      return { id: row.id, sequence: row.sequence, watchedMs: row.watchedMs };
    });
  }
  async update(id: string, body: z.infer<typeof watchBody>, actor: Principal) {
    const me = (await this.feed.viewer(actor, true))!;
    return this.feed.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'watch:' + id},0))`;
      const session = await tx.watchSession.findUnique({ where: { id } });
      if (
        !session ||
        session.profileId !== me.id ||
        session.createdAt.getTime() < Date.now() - 24 * 3600000
      )
        throw new NotFoundException();
      const video = await this.feed.requireReadable(session.videoId, actor);
      if (body.sequence <= session.sequence)
        return { accepted: false, sequence: session.sequence };
      const duration = Math.round((video.duration || 0) * 1000);
      if (
        body.positionMs > duration + 1000 ||
        body.watchedMs < session.watchedMs ||
        body.watchedMs > Date.now() - session.createdAt.getTime() + 2000
      )
        throw new BadRequestException('Mesure de lecture incohérente.');
      await lockActiveVideo(tx, session.videoId);
      const counted =
        session.viewCounted ||
        body.watchedMs >= Math.max(250, Math.min(2000, duration));
      const row = await tx.watchSession.update({
        where: { id },
        data: {
          sequence: body.sequence,
          watchedMs: body.watchedMs,
          viewCounted: counted,
          positionMs: Math.min(duration, body.positionMs),
          lastEvent: body.event,
          completed:
            session.completed ||
            (body.event === 'complete' &&
              body.positionMs >= duration - 1000 &&
              body.watchedMs >= Math.min(duration * 0.8, 10000)),
          replayCount:
            session.replayCount +
            (body.event === 'replay' && session.completed ? 1 : 0),
        },
      });
      if (counted && !session.viewCounted)
        await tx.video.update({
          where: { id: session.videoId },
          data: { viewCount: { increment: 1 } },
        });
      await tx.watchEvent.create({
        data: {
          sessionId: id,
          sequence: body.sequence,
          type: body.event,
          watchedMs: row.watchedMs,
          positionMs: row.positionMs,
        },
      });
      return { accepted: true, sequence: row.sequence };
    });
  }
  async history(actor: Principal) {
    const me = (await this.feed.viewer(actor, true))!;
    const excluded = await this.feed.exclusions(me.id);
    const rows = await this.feed.db.watchSession.findMany({
      where: {
        profileId: me.id,
        updatedAt: { gte: new Date(Date.now() - 90 * 86400000) },
        video: {
          status: 'published',
          visibility: 'public',
          profile: profileVisibility(me.id, excluded),
        },
      },
      include: { video: { include: { profile: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const seen = new Set<string>();
    return {
      items: rows
        .filter((r) => {
          if (seen.has(r.videoId)) return false;
          seen.add(r.videoId);
          return true;
        })
        .slice(0, 50)
        .map((r) => ({
          videoId: r.videoId,
          title: r.video.title,
          kind: r.video.kind,
          positionMs: r.positionMs,
          watchedMs: r.watchedMs,
          completed: r.completed,
          updatedAt: r.updatedAt,
          creator: r.video.profile?.username,
        })),
    };
  }
  async clear(actor: Principal) {
    const me = (await this.feed.viewer(actor, true))!;
    await this.feed.db.watchSession.deleteMany({ where: { profileId: me.id } });
    return { deleted: true };
  }
}
