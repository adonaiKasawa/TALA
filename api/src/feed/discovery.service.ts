import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../auth/auth.metadata.js';
import { requireRole } from '../auth/permissions.js';
import type { Prisma } from '../generated/prisma/client.js';
import { FeedService } from './feed.service.js';
import { CommunityService } from './community.service.js';
import { profileVisibility } from './visibility.js';
import {
  rankingFeatures,
  predict,
  fit,
  logLoss,
  type Sample,
} from './ranking.js';
export const discoveryQuery = z
  .object({
    kind: z.enum(['short', 'long']).default('short'),
    mode: z.enum(['foryou', 'social', 'trial']).default('foryou'),
    limit: z.coerce.number().int().min(1).max(20).default(10),
    cursor: z.string().max(400).optional(),
    category: z.string().max(60).optional(),
    language: z.string().max(35).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    tag: z.string().max(60).optional(),
    sound: z.uuid().optional(),
    challenge: z.uuid().optional(),
  })
  .strict();
@Injectable()
export class DiscoveryService {
  constructor(
    private readonly feed: FeedService,
    private readonly community: CommunityService,
  ) {}
  async eligible(actor?: Principal): Promise<Prisma.VideoWhereInput> {
    const me = await this.feed.viewer(actor);
    return {
      status: 'published',
      visibility: 'public',
      profile: profileVisibility(me?.id, await this.feed.exclusions(me?.id)),
      ...(me
        ? { reactions: { none: { profileId: me.id, kind: 'not_interested' } } }
        : {}),
    };
  }
  async search(q: string, actor?: Principal) {
    const me = await this.feed.viewer(actor),
      excluded = await this.feed.exclusions(me?.id);
    const where = await this.eligible(actor);
    const [videos, creators, sounds, hashtagVideos] = await Promise.all([
      this.feed.db.video.findMany({
        where: {
          AND: [
            where,
            {
              trial: false,
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { hashtags: { has: q.replace(/^#/, '').toLowerCase() } },
              ],
            },
          ],
        },
        take: 30,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      }),
      this.feed.db.profile.findMany({
        where: {
          ...profileVisibility(me?.id, excluded),
          AND: [
            {
              OR: [
                { username: { contains: q, mode: 'insensitive' } },
                { displayName: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
          verifiedAt: true,
        },
        take: 30,
        orderBy: { username: 'asc' },
      }),
      this.feed.db.sound.findMany({
        where: {
          label: { contains: q, mode: 'insensitive' },
          videos: { some: { AND: [where, { trial: false }] } },
        },
        select: { id: true, label: true, reuseAllowed: true },
        take: 30,
        orderBy: { id: 'asc' },
      }),
      this.feed.db.video.findMany({
        where: { AND: [where, { trial: false }] },
        select: { hashtags: true },
        take: 500,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return {
      videos: await this.community.readableItems(
        videos.map((v) => v.id),
        actor,
      ),
      creators: creators.map((p) => ({
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        verified: !!p.verifiedAt,
      })),
      sounds,
      hashtags: [
        ...new Set(
          hashtagVideos
            .flatMap((v) => v.hashtags)
            .filter((t) => t.includes(q.replace(/^#/, '').toLowerCase())),
        ),
      ].slice(0, 30),
    };
  }
  async suggestions(actor: Principal) {
    const me = (await this.feed.viewer(actor, true))!,
      excluded = await this.feed.exclusions(me.id);
    const following = await this.feed.db.creatorRelation.findMany({
      where: { fromId: me.id, kind: 'follow' },
      select: { toId: true },
    });
    const candidates = await this.feed.db.profile.findMany({
      where: {
        ...profileVisibility(me.id, [
          ...excluded,
          me.id,
          ...following.map((f) => f.toId),
        ]),
        isPrivate: false,
        videos: {
          some: { status: 'published', visibility: 'public', trial: false },
        },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        verifiedAt: true,
        createdAt: true,
        videos: {
          where: { status: 'published', visibility: 'public', trial: false },
          select: { hashtags: true, category: true },
          take: 10,
          orderBy: { publishedAt: 'desc' },
        },
        _count: { select: { relationsTo: { where: { kind: 'follow' } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const interests = new Set(me.interests.map((i) => i.toLowerCase()));
    return {
      items: candidates
        .map((p) => ({
          ...p,
          score:
            p.videos.reduce(
              (sum, v) =>
                sum +
                [...v.hashtags, v.category].filter((t) =>
                  interests.has(t.toLowerCase()),
                ).length,
              0,
            ) + (p._count.relationsTo < 10 ? 2 : 0),
        }))
        .sort(
          (a, b) =>
            b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .slice(0, 20)
        .map((p) => ({
          username: p.username,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
          verified: !!p.verifiedAt,
        })),
    };
  }
  async page(input: z.infer<typeof discoveryQuery>, actor: Principal) {
    const me = (await this.feed.viewer(actor, true))!,
      db = this.feed.db;
    const { cursor, limit, ...filters } = input,
      scope = JSON.stringify(filters);
    let ids: string[],
      snapshotId: string,
      offset = 0;
    if (cursor) {
      let data: { snapshot: string; offset: number };
      try {
        data = z
          .object({
            snapshot: z.uuid(),
            offset: z.number().int().min(0).max(150),
          })
          .strict()
          .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
      } catch {
        throw new BadRequestException('Curseur invalide.');
      }
      const snapshot = await db.feedSnapshot.findFirst({
        where: {
          id: data.snapshot,
          profileId: me.id,
          scope,
          expiresAt: { gt: new Date() },
        },
      });
      if (!snapshot)
        throw new BadRequestException('Session du fil expirée ou différente.');
      ids = snapshot.videos;
      snapshotId = snapshot.id;
      offset = data.offset;
    } else {
      const following = (
        await db.creatorRelation.findMany({
          where: { fromId: me.id, kind: 'follow' },
          select: { toId: true },
        })
      ).map((r) => r.toId);
      const mine = await db.videoReaction.findMany({
        where: {
          profileId: me.id,
          kind: 'like',
          ...(me.discoveryResetAt
            ? { createdAt: { gte: me.discoveryResetAt } }
            : {}),
        },
        select: { videoId: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const peers = await db.videoReaction.groupBy({
        by: ['profileId'],
        where: {
          videoId: { in: mine.map((r) => r.videoId) },
          kind: 'like',
          profileId: { not: me.id },
          profile: { isPrivate: false, suspended: false },
        },
        _count: true,
        orderBy: { _count: { profileId: 'desc' } },
        take: 50,
      });
      const socialIds = [
        ...new Set([
          ...following,
          ...peers.filter((p) => p._count >= 2).map((p) => p.profileId),
        ]),
      ];
      const where = await this.eligible(actor);
      const candidates = await db.video.findMany({
        where: {
          AND: [
            where,
            {
              kind: input.kind,
              ...(input.category ? { category: input.category } : {}),
              ...(input.language ? { language: input.language } : {}),
              ...(input.country ? { country: input.country } : {}),
              ...(input.tag
                ? { hashtags: { has: input.tag.toLowerCase() } }
                : {}),
              ...(input.sound ? { soundId: input.sound } : {}),
              ...(input.challenge ? { challengeId: input.challenge } : {}),
              ...(input.mode === 'trial'
                ? { trial: true, profileId: { notIn: [me.id, ...following] } }
                : { trial: false }),
            },
          ],
        },
        include: {
          profile: {
            include: {
              _count: {
                select: { relationsTo: { where: { kind: 'follow' } } },
              },
            },
          },
          _count: { select: { reactions: { where: { kind: 'like' } } } },
          reposts: {
            where: { profileId: { in: following } },
            select: { profileId: true },
            take: 10,
          },
          reactions: {
            where: { kind: 'like', profileId: { in: following } },
            select: { profileId: true },
            take: 10,
          },
        },
        take: 500,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      });
      const watched = await db.watchSession.findMany({
        where: {
          profileId: me.id,
          ...(me.discoveryResetAt
            ? { createdAt: { gte: me.discoveryResetAt } }
            : {}),
        },
        select: { videoId: true },
        distinct: ['videoId'],
        take: 1000,
        orderBy: { createdAt: 'desc' },
      });
      const seen = new Set(watched.map((w) => w.videoId));
      const model = await db.recommendationModel.findFirst({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
      });
      const weights = z
        .array(z.number().finite())
        .length(7)
        .safeParse(model?.weights);
      const sharedLikes = await db.videoReaction.groupBy({
        by: ['videoId'],
        where: {
          videoId: { in: candidates.map((v) => v.id) },
          kind: 'like',
          profileId: { in: socialIds },
        },
        _count: true,
      });
      const affinity = new Map(sharedLikes.map((r) => [r.videoId, r._count]));
      const ranked = candidates
        .map((v) => {
          const features = rankingFeatures(
            me,
            v,
            following.includes(v.profileId!),
            (v.profile?._count.relationsTo || 0) < 10,
          );
          const social =
            Number(following.includes(v.profileId!)) +
            v.reposts.length * 2 +
            (affinity.get(v.id) || 0);
          const score =
            (weights.success
              ? predict(weights.data, features) * 10
              : features[1] * 4 +
                features[2] * 2 +
                features[3] +
                features[4] * 2 +
                features[5] * 3) +
            social +
            Math.min(2, Math.log1p(v._count.reactions) / 4) -
            (seen.has(v.id) ? 8 : 0);
          return {
            v,
            score,
            social,
            novel: (v.profile?._count.relationsTo || 0) < 10,
          };
        })
        .filter((v) => input.mode !== 'social' || v.social > 0)
        .sort((a, b) => b.score - a.score || b.v.id.localeCompare(a.v.id));
      // Reserve one slot in five for smaller creators, and diversify each page.
      const result: typeof ranked = [],
        remaining = [...ranked];
      while (remaining.length && result.length < 150) {
        const page = result.slice(Math.floor(result.length / 10) * 10),
          counts = new Map<string, number>();
        page.forEach((r) =>
          counts.set(r.v.profileId!, (counts.get(r.v.profileId!) || 0) + 1),
        );
        const allowed = (r: (typeof ranked)[number]) =>
          (counts.get(r.v.profileId!) || 0) < 2;
        let pick =
          result.length % 5 === 4
            ? remaining.findIndex((r) => r.novel && allowed(r))
            : -1;
        if (pick < 0) pick = remaining.findIndex(allowed);
        if (pick < 0) pick = 0;
        result.push(remaining.splice(pick, 1)[0]);
      }
      ids = result.map((r) => r.v.id);
      snapshotId = randomUUID();
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${me.id},0))`;
        await tx.feedSnapshot.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        const old = await tx.feedSnapshot.findMany({
          where: { profileId: me.id },
          orderBy: { createdAt: 'desc' },
          skip: 9,
          select: { id: true },
        });
        await tx.feedSnapshot.deleteMany({
          where: { id: { in: old.map((s) => s.id) } },
        });
        await tx.feedSnapshot.create({
          data: {
            id: snapshotId,
            profileId: me.id,
            scope,
            videos: ids,
            expiresAt: new Date(Date.now() + 900000),
          },
        });
      });
    }
    const slice = ids.slice(offset, offset + limit);
    const visible = new Set(
      (
        await db.video.findMany({
          where: { AND: [await this.eligible(actor), { id: { in: slice } }] },
          select: { id: true },
        })
      ).map((v) => v.id),
    );
    return {
      items: await this.community.readableItems(
        slice.filter((id) => visible.has(id)),
        actor,
      ),
      nextCursor:
        offset + limit < ids.length
          ? Buffer.from(
              JSON.stringify({ snapshot: snapshotId, offset: offset + limit }),
            ).toString('base64url')
          : null,
      order: 'personalized',
      expiresIn: 900,
    };
  }
  async reset(actor: Principal) {
    const me = (await this.feed.viewer(actor, true))!;
    await this.feed.db.$transaction([
      this.feed.db.profile.update({
        where: { id: me.id },
        data: { interests: [], discoveryResetAt: new Date() },
      }),
      this.feed.db.feedSnapshot.deleteMany({ where: { profileId: me.id } }),
      this.feed.db.videoReaction.deleteMany({
        where: { profileId: me.id, kind: 'not_interested' },
      }),
    ]);
    return {
      reset: true,
      message:
        'Personnalisation réinitialisée ; abonnements, favoris et historique conservés.',
    };
  }
  async trends(actor?: Principal) {
    const eligible = await this.eligible(actor);
    const videos = await this.feed.db.video.findMany({
      where: {
        AND: [
          eligible,
          {
            trial: false,
            publishedAt: { gte: new Date(Date.now() - 7 * 86400000) },
          },
        ],
      },
      include: {
        watchSessions: {
          where: {
            watchedMs: { gte: 2000 },
            createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
          },
          select: { profileId: true },
          distinct: ['profileId'],
          take: 1000,
        },
      },
      take: 500,
      orderBy: { publishedAt: 'desc' },
    });
    const sorted = videos.sort(
      (a, b) =>
        b.watchSessions.length - a.watchSessions.length ||
        b.publishedAt!.getTime() - a.publishedAt!.getTime(),
    );
    const tags = new Map<string, Set<string>>();
    for (const v of sorted)
      for (const tag of v.hashtags) {
        const viewers = tags.get(tag) || new Set<string>();
        v.watchSessions.forEach((w) => viewers.add(w.profileId));
        tags.set(tag, viewers);
      }
    return {
      videos: await this.community.readableItems(
        sorted.slice(0, 20).map((v) => v.id),
        actor,
      ),
      hashtags: [...tags]
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 30)
        .map(([tag, viewers]) => ({ tag, viewers: viewers.size })),
    };
  }
  async createSound(
    videoId: string,
    label: string,
    reuseAllowed: boolean,
    actor: Principal,
  ) {
    await this.feed.videos.owned(videoId, actor);
    return this.feed.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Video" WHERE id=${videoId} FOR UPDATE`;
      const video = await tx.video.findUniqueOrThrow({
        where: { id: videoId },
      });
      if (video.soundId) throw new ConflictException('Son déjà attribué.');
      const sound = await tx.sound.create({
        data: {
          label,
          reuseAllowed,
          creatorIssuer: actor.issuer,
          creatorSubject: actor.subject,
        },
      });
      await tx.video.update({
        where: { id: videoId },
        data: { soundId: sound.id },
      });
      return { id: sound.id, label: sound.label, reuseAllowed };
    });
  }
  async attach(
    videoId: string,
    data: { soundId?: string | null; challengeId?: string | null },
    actor: Principal,
  ) {
    await this.feed.videos.owned(videoId, actor);
    if (data.soundId) {
      const sound = await this.feed.db.sound.findFirst({
        where: {
          id: data.soundId,
          reuseAllowed: true,
          videos: { some: await this.eligible(actor) },
        },
      });
      if (!sound)
        throw new NotFoundException('Son indisponible ou non réutilisable.');
    }
    if (
      data.challengeId &&
      !(await this.feed.db.challenge.count({
        where: {
          id: data.challengeId,
          active: true,
          startsAt: { lte: new Date() },
          endsAt: { gt: new Date() },
        },
      }))
    )
      throw new NotFoundException('Défi indisponible.');
    await this.feed.db.video.update({ where: { id: videoId }, data });
    return { updated: true };
  }
  async challenges() {
    return this.feed.db.challenge.findMany({
      where: {
        active: true,
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
      },
      take: 50,
      orderBy: { endsAt: 'asc' },
    });
  }
  async createChallenge(
    data: {
      slug: string;
      title: string;
      description: string;
      startsAt: Date;
      endsAt: Date;
    },
    actor: Principal,
  ) {
    requireRole(actor, ['moderator', 'admin'], true);
    if (data.endsAt <= data.startsAt)
      throw new BadRequestException('Période invalide.');
    return this.feed.db.challenge.create({ data });
  }
  async trialResults(id: string, actor: Principal) {
    await this.feed.videos.owned(id, actor);
    const rows = await this.feed.db.watchSession.findMany({
      where: { videoId: id },
      select: { profileId: true, watchedMs: true, completed: true },
      take: 10000,
    });
    return {
      videoId: id,
      viewers: new Set(rows.map((r) => r.profileId)).size,
      watchedMs: rows.reduce((sum, r) => sum + r.watchedMs, 0),
      completedViewers: new Set(
        rows.filter((r) => r.completed).map((r) => r.profileId),
      ).size,
    };
  }
  async train(actor: Principal) {
    requireRole(actor, ['admin'], true);
    const rows = await this.feed.db.watchSession.findMany({
      where: {
        updatedAt: { lt: new Date(Date.now() - 3600000) },
        profile: { suspended: false },
        video: { status: 'published' },
      },
      include: { video: { select: { duration: true } } },
      distinct: ['profileId', 'videoId'],
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const samples: (Sample & { profileId: string; videoId: string })[] = rows
      .reverse()
      .flatMap((row) => {
        const features = z
          .array(z.number().finite().min(0).max(1))
          .length(7)
          .safeParse(row.features);
        if (
          !features.success ||
          !row.video.duration ||
          (row.watchedMs >= 1500 && row.watchedMs < row.video.duration * 700)
        )
          return [];
        return [
          {
            features: features.data,
            profileId: row.profileId,
            videoId: row.videoId,
            label: Number(row.watchedMs >= row.video.duration * 700),
          },
        ];
      });
    if (
      samples.length < 200 ||
      new Set(samples.map((s) => s.profileId)).size < 20 ||
      new Set(samples.map((s) => s.videoId)).size < 5
    )
      throw new ConflictException(
        'Au moins 200 couples spectateur/vidéo étiquetés, 20 spectateurs et 5 vidéos sont requis.',
      );
    const split = Math.floor(samples.length * 0.8),
      training = samples.slice(0, split),
      evaluation = samples.slice(split);
    if (
      [training, evaluation].some(
        (set) =>
          set.filter((s) => s.label).length < 10 ||
          set.filter((s) => !s.label).length < 10,
      )
    )
      throw new ConflictException('Échantillon insuffisamment diversifié.');
    const weights = fit(training),
      rate = training.filter((s) => s.label).length / training.length;
    const loss = logLoss(evaluation, (s) => predict(weights, s.features)),
      baselineLoss = logLoss(evaluation, () => rate);
    return this.feed.db.recommendationModel.create({
      data: {
        weights,
        trainedUntil: new Date(),
        metrics: {
          samples: samples.length,
          training: training.length,
          evaluation: evaluation.length,
          loss,
          baselineLoss,
          eligible: loss < baselineLoss - 0.01,
          split: 'chronological-80-20',
        },
      },
    });
  }
  async activateModel(id: string, actor: Principal) {
    requireRole(actor, ['admin'], true);
    return this.feed.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('recommendation-model',0))`;
      const model = await tx.recommendationModel.findUnique({ where: { id } });
      if (
        !model ||
        !z.object({ eligible: z.literal(true) }).safeParse(model.metrics)
          .success
      )
        throw new ConflictException(
          'Modèle non évalué ou inférieur à la référence.',
        );
      await tx.recommendationModel.updateMany({ data: { active: false } });
      await tx.businessAudit.create({
        data: {
          actor: actor.subject,
          action: 'recommendation.activate',
          target: id,
        },
      });
      return tx.recommendationModel.update({
        where: { id },
        data: { active: true },
      });
    });
  }
  async models(actor: Principal) {
    requireRole(actor, ['admin'], true);
    return this.feed.db.recommendationModel.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
  async stopModel(actor: Principal) {
    requireRole(actor, ['admin'], true);
    await this.feed.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('recommendation-model',0))`;
      await tx.recommendationModel.updateMany({ data: { active: false } });
      await tx.businessAudit.create({
        data: {
          actor: actor.subject,
          action: 'recommendation.deactivate',
          target: 'active',
        },
      });
    });
    return { order: 'heuristic' };
  }
}
