import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import Mux from '@mux/ts';
import { createHmac, timingSafeEqual, createPrivateKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { VideoConfig } from './video-config.service.js';
import { Database } from '../database/database.service.js';
import type { Video } from '../generated/prisma/client.js';
const eventSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().max(100),
  data: z.object({
    id: z.string().max(128),
    passthrough: z.string().optional(),
    asset_id: z.string().optional(),
    upload_id: z.string().optional(),
    new_asset_settings: z
      .object({ passthrough: z.string().optional() })
      .optional(),
    duration: z.number().finite().positive().optional(),
    playback_ids: z
      .array(
        z.object({
          id: z.string().regex(/^[A-Za-z0-9]+$/),
          policy: z.string(),
        }),
      )
      .optional(),
  }),
});
@Injectable()
export class MuxService {
  private sdk?: Mux;
  constructor(
    private readonly config: VideoConfig,
    private readonly db: Database,
  ) {}
  client() {
    const c = this.config.value;
    if (!c.MUX_TOKEN_ID || !c.MUX_TOKEN_SECRET)
      throw new ServiceUnavailableException('Mux non configuré.');
    return (this.sdk ??= new Mux({
      tokenId: c.MUX_TOKEN_ID,
      tokenSecret: c.MUX_TOKEN_SECRET,
      baseURL: 'https://api.mux.com',
      logLevel: 'off',
      maxRetries: 0,
      timeout: 30000,
    }));
  }
  async transfer(v: Video, path: string, signal?: AbortSignal) {
    const client = this.client();
    let uploadId = v.muxUploadId;
    if (!uploadId) {
      if (v.muxCreationStarted) {
        let inspected = 0;
        for await (const upload of client.video.uploads.list({ limit: 100 })) {
          if (upload.new_asset_settings?.passthrough === v.muxAttempt) {
            uploadId = upload.id;
            break;
          }
          if (++inspected >= 2000) break;
        }
        if (!uploadId) throw new Error('MUX_RECONCILIATION_REQUIRED');
      } else {
        const marked = await this.db.video.updateMany({
          where: {
            id: v.id,
            status: { not: 'deleted' },
            muxCreationStarted: false,
          },
          data: { muxCreationStarted: true },
        });
        if (!marked.count) throw new Error('MEDIA_CANCELLED');
        const upload = await client.video.uploads.create(
          {
            cors_origin: this.config.value.MEDIA_ORIGIN,
            timeout: 86400,
            test: v.isTest,
            new_asset_settings: {
              passthrough: v.muxAttempt,
              playback_policies: ['signed'],
              video_quality: 'basic',
            },
          },
          { signal },
        );
        uploadId = upload.id;
      }
      // Keep the external ID even if deletion raced with creation, so cleanup can find it.
      await this.db.video.update({
        where: { id: v.id },
        data: { muxUploadId: uploadId },
      });
    }
    const current = await this.db.video.findUniqueOrThrow({
      where: { id: v.id },
    });
    if (current.status === 'deleted') throw new Error('MEDIA_CANCELLED');
    const upload = await client.video.uploads.retrieve(uploadId, { signal });
    if (v.isTest && !upload.test) throw new Error('MUX_TEST_POLICY_MISMATCH');
    if (upload.asset_id) {
      await this.db.video.update({
        where: { id: v.id },
        data: { muxAssetId: upload.asset_id },
      });
      return upload.asset_id;
    }
    if (upload.status !== 'waiting' || !upload.url)
      throw new Error('MUX_UPLOAD_UNAVAILABLE');
    const url = new URL(upload.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !(
        url.hostname === 'storage.googleapis.com' ||
        url.hostname.endsWith('.storage.googleapis.com') ||
        url.hostname === 'storage.mux.com' ||
        url.hostname.endsWith('.mux.com')
      )
    )
      throw new Error('MUX_UPLOAD_HOST');
    const stream = createReadStream(path);
    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: Readable.toWeb(stream) as ReadableStream,
        duplex: 'half',
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(current.preparedBytes),
        },
        redirect: 'error',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(1800000)])
          : AbortSignal.timeout(1800000),
      } as RequestInit);
      if (!response.ok) throw new Error('MUX_TRANSFER_FAILED');
      await response.body?.cancel();
    } finally {
      stream.destroy();
    }
    return null;
  }
  async reconcile(v: Video) {
    if (!v.muxUploadId) return;
    const upload = await this.client().video.uploads.retrieve(v.muxUploadId);
    if (upload.asset_id) {
      await this.db.video.updateMany({
        where: { id: v.id, muxAssetId: null },
        data: { muxAssetId: upload.asset_id },
      });
      const asset = await this.client().video.assets.retrieve(upload.asset_id);
      if (asset.status === 'ready')
        await this.acceptReady(
          v.id,
          asset.id,
          asset.playback_ids || [],
          asset.duration,
        );
      if (asset.status === 'errored')
        await this.db.video.updateMany({
          where: { id: v.id, status: 'mux_processing' },
          data: { status: 'failed', errorCode: 'MUX_ENCODING_FAILED' },
        });
    } else if (['errored', 'cancelled', 'timed_out'].includes(upload.status))
      throw new Error('MUX_UPLOAD_UNAVAILABLE');
  }
  async acceptReady(
    id: string,
    assetId: string,
    playback: Array<{ id: string; policy: string }>,
    duration?: number,
  ) {
    const signed = playback.find((p) => p.policy === 'signed');
    if (!signed || !/^[A-Za-z0-9]+$/.test(signed.id))
      throw new Error('MUX_SIGNED_PLAYBACK_REQUIRED');
    await this.db.video.updateMany({
      where: {
        id,
        status: { in: ['transferring', 'mux_processing'] },
        driver: 'mux',
        OR: [{ muxAssetId: null }, { muxAssetId: assetId }],
      },
      data: {
        status: 'ready',
        muxAssetId: assetId,
        muxPlaybackId: signed.id,
        thumbnailPending: false,
        ...(duration ? { duration } : {}),
        errorCode: null,
      },
    });
  }
  async playback(v: Video) {
    if (!v.muxPlaybackId)
      throw new ServiceUnavailableException('Lecture en préparation.');
    const { SignJWT, importPKCS8 } = await import('jose');
    const c = this.config.value,
      key = await importPKCS8(
        createPrivateKey(
          await readFile(c.MUX_SIGNING_PRIVATE_KEY_PATH!, 'utf8'),
        )
          .export({ type: 'pkcs8', format: 'pem' })
          .toString(),
        'RS256',
      );
    const sign = (aud: string, extra: Record<string, unknown> = {}) =>
      new SignJWT(extra)
        .setProtectedHeader({ alg: 'RS256', kid: c.MUX_SIGNING_KEY_ID! })
        .setSubject(v.muxPlaybackId!)
        .setAudience(aud)
        .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
        .sign(key);
    const video = await sign('v'),
      thumbnail = await sign('t', { time: v.thumbnailTime });
    return {
      url: `https://stream.mux.com/${v.muxPlaybackId}.m3u8?token=${video}`,
      thumbnail: `https://image.mux.com/${v.muxPlaybackId}/thumbnail.jpg?token=${thumbnail}`,
      type: 'hls',
      expiresIn: 300,
    };
  }
  async prepareDownload(v: Video) {
    if (!v.muxAssetId) throw new ConflictException('Encodage en cours.');
    const asset = await this.client().video.assets.retrieve(v.muxAssetId);
    const existing = asset.static_renditions?.files?.find(
      (f) => f.resolution === 'highest',
    );
    if (existing) return { status: existing.status };
    const rendition = await this.client().video.assets.createStaticRendition(
      v.muxAssetId,
      { resolution: 'highest' },
    );
    return { status: rendition.status || 'preparing' };
  }
  async download(v: Video) {
    if (!v.muxAssetId) throw new ConflictException('Encodage en cours.');
    const asset = await this.client().video.assets.retrieve(v.muxAssetId);
    const file = asset.static_renditions?.files?.find(
      (f) => f.resolution === 'highest' && f.status === 'ready',
    );
    if (!file?.name || !/^[a-zA-Z0-9_-]+\.mp4$/.test(file.name))
      throw new ConflictException('Téléchargement en préparation.');
    const playback = await this.playback(v);
    const token = new URL(playback.url).searchParams.get('token')!;
    return {
      url: `https://stream.mux.com/${v.muxPlaybackId}/${file.name}?token=${encodeURIComponent(token)}`,
      type: 'mp4',
      expiresIn: 300,
    };
  }
  async cleanup(v: Video) {
    let asset = v.muxAssetId;
    if (v.muxUploadId) {
      try {
        const upload = await this.client().video.uploads.retrieve(
          v.muxUploadId,
        );
        asset ??= upload.asset_id || null;
        if (upload.status === 'waiting')
          await this.client().video.uploads.cancel(v.muxUploadId);
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
      }
    } else if (v.muxCreationStarted) {
      let count = 0;
      let found = false;
      for await (const upload of this.client().video.uploads.list({
        limit: 100,
      })) {
        if (upload.new_asset_settings?.passthrough === v.muxAttempt) {
          found = true;
          if (upload.asset_id) asset = upload.asset_id;
          else if (upload.status === 'waiting')
            await this.client().video.uploads.cancel(upload.id);
          break;
        }
        if (++count >= 2000) throw new Error('MUX_RECONCILIATION_REQUIRED');
      }
      if (!found) throw new Error('MUX_RECONCILIATION_REQUIRED');
    }
    if (asset) {
      try {
        await this.client().video.assets.delete(asset);
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
      }
    }
  }
  async webhook(raw: Buffer, header: string) {
    const secret = this.config.value.MUX_WEBHOOK_SECRET;
    if (!this.config.enabled || !secret)
      throw new ServiceUnavailableException('Réception Mux non configurée.');
    const parts = header.split(',').map((p) => p.trim()),
      times = parts.filter((p) => p.startsWith('t='));
    if (times.length !== 1 || !/^t=\d+$/.test(times[0]))
      throw new BadRequestException('Signature Mux invalide.');
    const timestamp = Number(times[0].slice(2));
    if (Math.abs(Date.now() / 1000 - timestamp) > 300)
      throw new BadRequestException('Signature Mux expirée.');
    const expected = createHmac('sha256', secret)
      .update(timestamp + '.')
      .update(raw)
      .digest();
    if (
      !parts.some(
        (p) =>
          /^v1=[a-f0-9]{64}$/i.test(p) &&
          timingSafeEqual(expected, Buffer.from(p.slice(3), 'hex')),
      )
    )
      throw new BadRequestException('Signature Mux invalide.');
    let event: z.infer<typeof eventSchema>;
    try {
      event = eventSchema.parse(JSON.parse(raw.toString('utf8')));
    } catch {
      throw new BadRequestException('Événement Mux invalide.');
    }
    const attempt =
      event.data.passthrough || event.data.new_asset_settings?.passthrough;
    return this.db.$transaction(async (tx) => {
      if (
        !(
          await tx.videoWebhook.createMany({
            data: [{ id: event.id, type: event.type }],
            skipDuplicates: true,
          })
        ).count
      )
        return { received: true };
      const v = await tx.video.findFirst({
        where: {
          driver: 'mux',
          OR: [
            ...(attempt ? [{ muxAttempt: attempt }] : []),
            { muxAssetId: event.data.id },
            { muxUploadId: event.data.id },
          ],
        },
      });
      if (!v || v.status === 'rejected') return { received: true };
      if (v.status === 'deleted') {
        const assetId =
          event.type === 'video.asset.ready'
            ? event.data.id
            : event.type === 'video.upload.asset_created'
              ? event.data.asset_id
              : undefined;
        if (assetId && (!v.muxAssetId || v.muxAssetId === assetId))
          await tx.video.update({
            where: { id: v.id },
            data: {
              muxAssetId: assetId,
              deletedCleanedAt: null,
              nextAttemptAt: null,
            },
          });
        return { received: true };
      }
      if (
        event.type === 'video.upload.asset_created' &&
        event.data.asset_id &&
        (!v.muxAssetId || v.muxAssetId === event.data.asset_id)
      )
        await tx.video.update({
          where: { id: v.id },
          data: { muxAssetId: event.data.asset_id },
        });
      if (
        event.type === 'video.asset.ready' &&
        (!v.muxAssetId || v.muxAssetId === event.data.id)
      ) {
        const playback = event.data.playback_ids?.find(
          (p) => p.policy === 'signed',
        );
        if (playback)
          await tx.video.updateMany({
            where: {
              id: v.id,
              status: { in: ['transferring', 'mux_processing'] },
            },
            data: {
              status: 'ready',
              muxAssetId: event.data.id,
              muxPlaybackId: playback.id,
              thumbnailPending: false,
              errorCode: null,
              ...(event.data.duration ? { duration: event.data.duration } : {}),
            },
          });
      }
      if (event.type === 'video.asset.errored')
        await tx.video.updateMany({
          where: {
            id: v.id,
            status: { in: ['transferring', 'mux_processing'] },
          },
          data: { status: 'failed', errorCode: 'MUX_ENCODING_FAILED' },
        });
      return { received: true };
    });
  }
}
