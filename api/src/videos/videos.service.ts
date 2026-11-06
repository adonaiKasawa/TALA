import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database } from '../database/database.service.js';
import type { Principal } from '../auth/auth.metadata.js';
import type { Video } from '../generated/prisma/client.js';
import { createVideo, patchVideo, editRecipe } from './video.schema.js';
import { VideoConfig } from './video-config.service.js';
import { PrivateStorage } from './private-storage.service.js';
import { hashtags } from '../feed/feed.schema.js';
import { requireRole } from '../auth/permissions.js';
@Injectable()
export class VideosService {
  constructor(
    readonly db: Database,
    readonly config: VideoConfig,
    readonly storage: PrivateStorage,
  ) {}
  enabled() {
    if (!this.config.enabled)
      throw new ServiceUnavailableException(
        'Le service vidéo n’est pas configuré.',
      );
  }
  owner(actor: Principal) {
    return { issuer: actor.issuer, subject: actor.subject };
  }
  view(v: Video) {
    return {
      id: v.id,
      title: v.title,
      description: v.description,
      visibility: v.visibility,
      kind: v.kind,
      language: v.language,
      category: v.category,
      country: v.country,
      allowDownload: v.allowDownload,
      pinnedRank: v.pinnedRank,
      soundId: v.soundId,
      challengeId: v.challengeId,
      trial: v.trial,
      replyToCommentId: v.replyToCommentId,
      status: v.status,
      driver: v.driver,
      isTest: v.isTest,
      size: v.expectedBytes,
      uploadedBytes: v.uploadedBytes,
      duration: v.duration,
      width: v.width,
      height: v.height,
      thumbnailTime: v.thumbnailTime,
      views: v.viewCount,
      editRecipe: v.editRecipe,
      optimization: v.optimization,
      qualityScore: v.qualityScore,
      errorCode: v.errorCode,
      createdAt: v.createdAt,
      publishedAt: v.publishedAt,
      chunkBytes: this.config.chunkBytes,
    };
  }
  async owned(id: string, actor: Principal) {
    this.enabled();
    const video = await this.db.video.findFirst({
      where: { id, ...this.owner(actor), status: { not: 'deleted' } },
    });
    if (!video) throw new NotFoundException('Vidéo introuvable.');
    return video;
  }
  async list(actor: Principal) {
    this.enabled();
    return (
      await this.db.video.findMany({
        where: { ...this.owner(actor), status: { not: 'deleted' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    ).map((v) => this.view(v));
  }
  async create(actor: Principal, data: z.infer<typeof createVideo>) {
    this.enabled();
    requireRole(actor, ['creator', 'professional', 'moderator', 'admin']);
    const c = this.config.value;
    if (data.size > c.MEDIA_MAX_BYTES)
      throw new BadRequestException('Le fichier dépasse la taille autorisée.');
    await this.storage.reserve(data.size);
    const video = await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.issuer + '|' + actor.subject},0))`;
        const profile = await tx.profile.findUnique({
          where: { issuer_subject: this.owner(actor) },
        });
        if (!profile)
          throw new BadRequestException(
            'Complétez votre profil avant de publier une vidéo.',
          );
        const recent = await tx.video.aggregate({
          where: {
            ...this.owner(actor),
            createdAt: { gte: new Date(Date.now() - 86400000) },
          },
          _count: true,
          _sum: { expectedBytes: true },
        });
        const active = await tx.video.count({
          where: {
            ...this.owner(actor),
            status: {
              in: [
                'draft',
                'uploading',
                'queued',
                'analyzing',
                'optimizing',
                'transferring',
                'mux_processing',
              ],
            },
          },
        });
        if (
          recent._count >= c.MEDIA_DAILY_UPLOADS ||
          (recent._sum.expectedBytes || 0) + data.size > c.MEDIA_DAILY_BYTES ||
          active >= 5
        )
          throw new ConflictException(
            'Limite d’import atteinte. Terminez vos imports ou réessayez demain.',
          );
        const { size, ...metadata } = data;
        return tx.video.create({
          data: {
            id: randomUUID(),
            ...this.owner(actor),
            profileId: profile.id,
            ...metadata,
            hashtags: hashtags(data.title + ' ' + data.description),
            expectedBytes: size,
            driver: c.MEDIA_DRIVER,
            isTest: c.MEDIA_DRIVER === 'mux' && c.MUX_TEST_ASSETS === 'true',
            expiresAt: new Date(Date.now() + 86400000),
            createdAt: new Date(),
          },
        });
      },
      { maxWait: 10000, timeout: 30000 },
    );
    return this.view(video);
  }
  async upload(id: string, actor: Principal, offset: number, bytes: Buffer) {
    await this.owned(id, actor);
    if (!bytes.length || bytes.length > this.config.chunkBytes)
      throw new BadRequestException('Bloc vidéo trop volumineux ou vide.');
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Video" WHERE id=${id} FOR UPDATE`;
        const v = await tx.video.findUniqueOrThrow({ where: { id } });
        if (
          !['draft', 'uploading'].includes(v.status) ||
          v.expiresAt < new Date() ||
          v.uploadedBytes !== offset ||
          offset + bytes.length > v.expectedBytes
        )
          throw new ConflictException(
            'Reprenez l’import à la position indiquée par le serveur.',
          );
        await this.storage.writeChunk(id, offset, bytes);
        return this.view(
          await tx.video.update({
            where: { id },
            data: { status: 'uploading', uploadedBytes: offset + bytes.length },
          }),
        );
      },
      { timeout: 30000 },
    );
  }
  async saveOverlay(id: string, actor: Principal, bytes: Buffer) {
    await this.owned(id, actor);
    if (
      bytes.length < 33 ||
      bytes.length > 4 * 1024 * 1024 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.toString('ascii', 12, 16) !== 'IHDR'
    )
      throw new BadRequestException('Un calque PNG valide est requis.');
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (
      width < 16 ||
      height < 16 ||
      width > 4096 ||
      height > 4096 ||
      width * height > 8388608
    )
      throw new BadRequestException('Dimensions du calque invalides.');
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Video" WHERE id=${id} FOR UPDATE`;
      const v = await tx.video.findFirstOrThrow({
        where: { id, ...this.owner(actor) },
      });
      if (
        !['draft', 'uploading'].includes(v.status) ||
        !editRecipe.parse(v.editRecipe || {}).overlay
      )
        throw new ConflictException('Ce montage ne peut plus être modifié.');
      await this.storage.saveOverlay(id, bytes);
    });
    return { message: 'Calque enregistré.' };
  }
  async complete(id: string, actor: Principal) {
    await this.owned(id, actor);
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Video" WHERE id=${id} FOR UPDATE`;
      const v = await tx.video.findFirstOrThrow({
        where: { id, ...this.owner(actor) },
      });
      if (!['draft', 'uploading'].includes(v.status)) return v;
      if (
        v.expiresAt < new Date() ||
        v.uploadedBytes !== v.expectedBytes ||
        (await this.storage.size(id, 'source.bin')) !== v.expectedBytes
      )
        throw new BadRequestException(
          'Le fichier n’est pas complètement envoyé.',
        );
      if (editRecipe.parse(v.editRecipe || {}).overlay) {
        try {
          if ((await this.storage.size(id, 'overlay.png')) < 33)
            throw new Error();
        } catch {
          throw new BadRequestException(
            'Le calque du montage n’est pas complètement envoyé.',
          );
        }
      }
      return tx.video.update({
        where: { id },
        data: { status: 'queued', uploadedAt: new Date() },
      });
    });
    return this.view(result);
  }
  async patch(id: string, actor: Principal, data: z.infer<typeof patchVideo>) {
    const v = await this.owned(id, actor);
    if (data.kind && data.kind !== v.kind && v.uploadedBytes > 0)
      throw new ConflictException(
        'Le format ne peut plus être changé après le début de l’envoi.',
      );
    if (
      v.duration &&
      data.thumbnailTime !== undefined &&
      data.thumbnailTime >= v.duration
    )
      throw new BadRequestException(
        'La miniature doit se trouver dans la vidéo.',
      );
    const result = await this.db.video.updateMany({
      where: { id, ...this.owner(actor), status: { not: 'deleted' } },
      data: {
        ...data,
        hashtags: hashtags(
          (data.title ?? v.title) + ' ' + (data.description ?? v.description),
        ),
        ...(data.thumbnailTime !== undefined ? { thumbnailPending: true } : {}),
      },
    });
    if (!result.count) throw new NotFoundException();
    return this.view(await this.owned(id, actor));
  }
  async publish(id: string, actor: Principal, publish: boolean) {
    await this.owned(id, actor);
    const result = await this.db.video.updateMany({
      where: {
        id,
        ...this.owner(actor),
        status: {
          in: publish ? ['ready', 'published'] : ['ready', 'published'],
        },
      },
      data: {
        status: publish ? 'published' : 'ready',
        publishedAt: publish ? new Date() : null,
      },
    });
    if (!result.count)
      throw new ConflictException(
        'Attendez la fin du traitement avant de publier.',
      );
    return this.view(await this.owned(id, actor));
  }
  async retry(id: string, actor: Principal) {
    const v = await this.owned(id, actor);
    if (
      v.status !== 'failed' ||
      v.temporaryCleanedAt ||
      v.expiresAt < new Date()
    )
      throw new ConflictException('Cet import ne peut pas être repris.');
    await this.db.video.updateMany({
      where: { id, status: 'failed' },
      data: {
        status: 'queued',
        errorCode: null,
        attempts: 0,
        nextAttemptAt: null,
        generation: { increment: 1 },
      },
    });
    return this.view(await this.owned(id, actor));
  }
  async remove(id: string, actor: Principal) {
    this.enabled();
    const where = { id, ...this.owner(actor) };
    await this.db.$transaction([
      this.db.video.updateMany({
        where,
        data: { status: 'deleted', publishedAt: null },
      }),
      this.db.videoReaction.deleteMany({ where: { video: where } }),
      this.db.videoComment.deleteMany({ where: { video: where } }),
      this.db.videoCaption.deleteMany({ where: { video: where } }),
      this.db.watchSession.deleteMany({ where: { video: where } }),
    ]);
    return { message: 'Vidéo supprimée ; nettoyage programmé.' };
  }
  async eraseOwner(actor: Principal) {
    await this.db.video.updateMany({
      where: { ...this.owner(actor), status: { not: 'deleted' } },
      data: { status: 'deleted', publishedAt: null },
    });
  }
  async readable(id: string, actor?: Principal) {
    this.enabled();
    const v = await this.db.video.findUnique({
      where: { id },
      include: { profile: true },
    });
    const own = actor?.issuer === v?.issuer && actor?.subject === v?.subject;
    const follower =
      actor && v?.profileId
        ? await this.db.creatorRelation.count({
            where: {
              toId: v.profileId,
              kind: 'follow',
              from: this.owner(actor),
            },
          })
        : 0;
    if (actor && v?.profileId && !own) {
      const viewer = await this.db.profile.findUnique({
        where: { issuer_subject: this.owner(actor) },
      });
      if (
        viewer &&
        (await this.db.creatorRelation.count({
          where: {
            kind: 'block',
            OR: [
              { fromId: viewer.id, toId: v.profileId },
              { fromId: v.profileId, toId: viewer.id },
            ],
          },
        }))
      )
        throw new NotFoundException('Vidéo indisponible.');
    }
    if (
      !v ||
      !['ready', 'published'].includes(v.status) ||
      (!own &&
        (v.status !== 'published' ||
          v.visibility === 'private' ||
          !v.profile ||
          v.profile.suspended ||
          (v.profile.isPrivate && !follower))) ||
      v?.profile?.suspended
    )
      throw new NotFoundException('Vidéo indisponible.');
    return v;
  }
  async publicList() {
    this.enabled();
    return (
      await this.db.video.findMany({
        where: {
          status: 'published',
          visibility: 'public',
          trial: false,
          profile: { isPrivate: false, suspended: false },
        },
        orderBy: { publishedAt: 'desc' },
        take: 50,
      })
    ).map((v) => this.view(v));
  }
  sign(id: string, file: 'video' | 'thumbnail', expires: number) {
    return createHmac(
      'sha256',
      Buffer.from(this.config.value.MEDIA_SIGNING_KEY!, 'hex'),
    )
      .update(`${id}|${file}|${expires}`)
      .digest('base64url');
  }
  async ticket(
    id: string,
    file: 'video' | 'thumbnail',
    expires: number,
    signature: string,
  ) {
    this.enabled();
    if (
      !Number.isSafeInteger(expires) ||
      expires < Date.now() / 1000 ||
      expires > Date.now() / 1000 + 601 ||
      !/^[A-Za-z0-9_-]{43}$/.test(signature)
    )
      throw new NotFoundException();
    const expected = this.sign(id, file, expires);
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature)))
      throw new NotFoundException();
    const video = await this.db.video.findUnique({ where: { id } });
    if (
      !video ||
      !['ready', 'published'].includes(video.status) ||
      video.driver !== 'local'
    )
      throw new NotFoundException();
    return file === 'video'
      ? ('prepared.mp4' as const)
      : ('poster.jpg' as const);
  }
  localUrl(id: string, file: 'video' | 'thumbnail') {
    const expires = Math.floor(Date.now() / 1000) + 300;
    return `${this.config.value.MEDIA_ORIGIN.replace(/\/$/, '')}/api/v1/media/${id}/${file}?expires=${expires}&signature=${this.sign(id, file, expires)}`;
  }
}
