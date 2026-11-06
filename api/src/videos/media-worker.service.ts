import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Database } from '../database/database.service.js';
import { VideoConfig } from './video-config.service.js';
import { PrivateStorage } from './private-storage.service.js';
import { MediaProcess, RejectedMedia } from './media-process.service.js';
import { MuxService } from './mux.service.js';
import { MediaQueue } from './media-queue.service.js';
import { Worker } from 'bullmq';
import type { Prisma } from '../generated/prisma/client.js';
const processing = [
  'queued',
  'analyzing',
  'optimizing',
  'transferring',
  'mux_processing',
] as const;
@Injectable()
export class MediaWorker implements OnModuleDestroy {
  private worker?: Worker;
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private stopping = false;
  private readonly active = new Set<AbortController>();
  constructor(
    private readonly db: Database,
    private readonly config: VideoConfig,
    private readonly storage: PrivateStorage,
    private readonly media: MediaProcess,
    private readonly mux: MuxService,
    private readonly queue: MediaQueue,
  ) {}
  start() {
    if (!this.config.enabled)
      throw new Error('Activer MEDIA_ENABLED avant de lancer le worker.');
    if (this.config.value.MEDIA_QUEUE_DRIVER === 'redis') {
      this.worker = new Worker(
        this.config.value.MEDIA_QUEUE,
        async (job) => {
          const data = job.data as { id?: unknown };
          if (typeof data.id === 'string') await this.process(data.id);
        },
        {
          connection: {
            ...this.config.connection(),
            maxRetriesPerRequest: null,
          },
          concurrency: 1,
        },
      );
      this.worker.on('error', () =>
        console.error(
          'Worker média : Redis indisponible, nouvelle tentative automatique.',
        ),
      );
    }
    this.timer = setInterval(() => void this.tick(), 5000);
    void this.tick();
  }
  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      await this.db.video.updateMany({
        where: {
          ...(this.config.value.MEDIA_WORKER_ISSUER
            ? { issuer: this.config.value.MEDIA_WORKER_ISSUER }
            : {}),
          status: { in: ['draft', 'uploading'] },
          expiresAt: { lt: new Date() },
        },
        data: { status: 'deleted', errorCode: 'MEDIA_UPLOAD_EXPIRED' },
      });
      const videos = await this.db.video.findMany({
        where: {
          ...(this.config.value.MEDIA_WORKER_ISSUER
            ? { issuer: this.config.value.MEDIA_WORKER_ISSUER }
            : {}),
          AND: [
            { OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
            {
              OR: [
                { nextAttemptAt: null },
                { nextAttemptAt: { lte: new Date() } },
              ],
            },
            {
              OR: [
                { status: { in: [...processing] } },
                { status: 'deleted', deletedCleanedAt: null },
                {
                  status: { in: ['ready', 'published'] },
                  thumbnailPending: true,
                },
                {
                  status: { in: ['ready', 'published', 'failed', 'rejected'] },
                  expiresAt: { lt: new Date() },
                  temporaryCleanedAt: null,
                },
              ],
            },
          ],
        },
        orderBy: { updatedAt: 'asc' },
        take: 20,
      });
      for (const video of videos) {
        if (this.config.value.MEDIA_QUEUE_DRIVER === 'redis')
          await this.queue.enqueue(video.id, video.generation).catch(() => {});
        else await this.process(video.id);
        if (this.stopping) break;
      }
      if (!this.config.value.MEDIA_WORKER_ISSUER)
        await this.db.videoWebhook.deleteMany({
          where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) } },
        });
      await this.db.video.updateMany({
        where: {
          ...(this.config.value.MEDIA_WORKER_ISSUER
            ? { issuer: this.config.value.MEDIA_WORKER_ISSUER }
            : {}),
          status: 'deleted',
          deletedCleanedAt: { not: null },
          issuer: this.config.value.MEDIA_WORKER_ISSUER || { not: 'deleted' },
          createdAt: { lt: new Date(Date.now() - 86400000) },
        },
        data: {
          issuer: 'deleted',
          subject: 'deleted',
          profileId: null,
          title: 'Vidéo supprimée',
          description: '',
          sourceHash: null,
        },
      });
    } catch {
      console.error(
        'Worker média : services indisponibles ; les tâches restent en base.',
      );
    } finally {
      this.busy = false;
    }
  }
  async process(id: string) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return;
    const leaseId = randomUUID();
    const claimed = await this.db.video.updateMany({
      where: {
        ...(this.config.value.MEDIA_WORKER_ISSUER
          ? { issuer: this.config.value.MEDIA_WORKER_ISSUER }
          : {}),
        id,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { leaseId, leaseUntil: new Date(Date.now() + 90000) },
    });
    if (!claimed.count) return;
    const video = await this.db.video.findUniqueOrThrow({ where: { id } }),
      controller = new AbortController();
    this.active.add(controller);
    if (this.stopping) controller.abort();
    const lease = setInterval(() => {
      void this.db.video
        .updateMany({
          where: {
            id,
            leaseId,
            ...(video.status === 'deleted'
              ? {}
              : { status: { not: 'deleted' as const } }),
          },
          data: { leaseUntil: new Date(Date.now() + 90000) },
        })
        .then((r) => {
          if (!r.count) controller.abort();
        })
        .catch(() => controller.abort());
    }, 20000);
    const update = async (data: Prisma.VideoUpdateManyMutationInput) => {
      const changed = await this.db.video.updateMany({
        where: { id, leaseId, status: { not: 'deleted' } },
        data,
      });
      if (!changed.count) throw new Error('MEDIA_CANCELLED');
    };
    try {
      if (video.status === 'deleted') {
        if (video.deletedCleanedAt) return;
        if (video.driver === 'mux') await this.mux.cleanup(video);
        await this.storage.removeFiles(id);
        await this.db.video.updateMany({
          where: { id, leaseId, status: 'deleted' },
          data: { deletedCleanedAt: new Date() },
        });
        return;
      }
      if (['ready', 'published', 'failed', 'rejected'].includes(video.status)) {
        if (
          ['ready', 'published'].includes(video.status) &&
          video.thumbnailPending
        ) {
          if (video.driver === 'local')
            await this.media.thumbnail(video, controller.signal);
          await this.db.video.updateMany({
            where: { id, leaseId, thumbnailTime: video.thumbnailTime },
            data: { thumbnailPending: false },
          });
        }
        if (video.expiresAt < new Date() && !video.temporaryCleanedAt) {
          await this.storage.removeFiles(
            id,
            video.driver === 'local' &&
              ['ready', 'published'].includes(video.status),
          );
          await update({ temporaryCleanedAt: new Date() });
        }
        return;
      }
      if (!processing.includes(video.status as (typeof processing)[number]))
        return;
      if (video.status === 'mux_processing') {
        await this.mux.reconcile(video);
        await update({ nextAttemptAt: new Date(Date.now() + 30000) });
        return;
      }
      if (video.attempts >= 3) {
        await update({
          status: 'failed',
          errorCode: 'MEDIA_RETRY_LIMIT',
          nextAttemptAt: null,
        });
        return;
      }
      // Count the attempt before spawning anything, so a process crash cannot reset it.
      await update({ attempts: { increment: 1 } });
      let current = video;
      if (!video.preparedBytes) {
        await update({ status: 'analyzing' });
        await this.storage.reserve(video.expectedBytes);
        const info = await this.media.analyze(video, controller.signal);
        await update({
          status: 'optimizing',
          duration: info.duration,
          width: info.width,
          height: info.height,
          fps: info.fps,
          sourceHash: info.sourceHash,
          sourceBytes: video.expectedBytes,
        });
        const prepared = await this.media.prepare(
          video,
          info,
          controller.signal,
        );
        await update({ ...prepared, errorCode: null });
        current = await this.db.video.findUniqueOrThrow({ where: { id } });
      }
      await this.media.thumbnail(current, controller.signal);
      if (current.driver === 'local') {
        await update({ status: 'ready', nextAttemptAt: null });
        await this.db.video.updateMany({
          where: {
            id,
            leaseId,
            status: 'ready',
            thumbnailTime: current.thumbnailTime,
          },
          data: { thumbnailPending: false },
        });
        return;
      }
      await update({ status: 'transferring' });
      const asset = await this.mux.transfer(
        current,
        await this.storage.path(id, 'prepared.mp4'),
        controller.signal,
      );
      await this.db.video.updateMany({
        where: { id, leaseId, status: 'transferring' },
        data: {
          status: 'mux_processing',
          ...(asset ? { muxAssetId: asset } : {}),
          nextAttemptAt: new Date(Date.now() + 10000),
        },
      });
    } catch (error) {
      const code = controller.signal.aborted
        ? 'MEDIA_CANCELLED'
        : error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : 'MEDIA_PROCESS_FAILED';
      if (code !== 'MEDIA_CANCELLED') {
        if (video.status === 'deleted')
          await this.db.video.updateMany({
            where: { id, leaseId, status: 'deleted' },
            data: {
              nextAttemptAt: new Date(Date.now() + 30000),
              errorCode: code,
            },
          });
        if (['ready', 'published'].includes(video.status))
          await this.db.video.updateMany({
            where: { id, leaseId, status: { in: ['ready', 'published'] } },
            data: {
              thumbnailPending: false,
              errorCode: code,
              nextAttemptAt: new Date(Date.now() + 30000),
            },
          });
        const terminal = error instanceof RejectedMedia || video.attempts >= 2;
        await this.db.video.updateMany({
          where: {
            id,
            leaseId,
            status: { notIn: ['deleted', 'ready', 'published'] },
          },
          data: {
            status:
              error instanceof RejectedMedia
                ? 'rejected'
                : terminal
                  ? 'failed'
                  : 'queued',
            errorCode: code,
            ...(video.status === 'mux_processing'
              ? { attempts: { increment: 1 } }
              : {}),
            nextAttemptAt: terminal
              ? null
              : new Date(Date.now() + 10000 * 2 ** video.attempts),
          },
        });
      }
    } finally {
      this.active.delete(controller);
      clearInterval(lease);
      await this.db.video
        .updateMany({
          where: { id, leaseId },
          data: { leaseId: null, leaseUntil: null },
        })
        .catch(() => {});
    }
  }
  async stop() {
    this.stopping = true;
    for (const controller of this.active) controller.abort();
    clearInterval(this.timer);
    await this.worker?.close();
    for (
      let attempt = 0;
      attempt < 100 && (this.active.size || this.busy);
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 50));
  }
  async onModuleDestroy() {
    await this.stop();
  }
}
