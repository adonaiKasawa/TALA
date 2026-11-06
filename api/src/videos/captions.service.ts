import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { VideosService } from './videos.service.js';
import type { Principal } from '../auth/auth.metadata.js';
import { lockActiveVideo } from './video-lock.js';
export const captionLanguage = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/);
export const captionBody = z
  .object({
    label: z.string().trim().min(1).max(60),
    content: z.string().max(20000),
  })
  .strict();
@Injectable()
export class CaptionsService {
  constructor(private readonly videos: VideosService) {}
  private signature(id: string, language: string, expires: number) {
    return createHmac(
      'sha256',
      Buffer.from(this.videos.config.value.MEDIA_SIGNING_KEY!, 'hex'),
    )
      .update(`caption|${id}|${language}|${expires}`)
      .digest('base64url');
  }
  async tracks(id: string) {
    const rows = await this.videos.db.videoCaption.findMany({
      where: { videoId: id },
      select: { language: true, label: true },
    });
    const expires = Math.floor(Date.now() / 1000) + 300;
    return rows.map((r) => ({
      ...r,
      url: `${this.videos.config.value.MEDIA_ORIGIN}/api/v1/videos/${id}/captions/${r.language}?expires=${expires}&signature=${this.signature(id, r.language, expires)}`,
    }));
  }
  async save(
    id: string,
    language: string,
    body: z.infer<typeof captionBody>,
    actor: Principal,
  ) {
    const video = await this.videos.owned(id, actor);
    let content = body.content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (
      Buffer.byteLength(content, 'utf8') > 20000 ||
      !/^WEBVTT\n\n/.test(content)
    )
      throw new BadRequestException('Fichier WebVTT de 20 Ko maximum requis.');
    const blocks = content
      .trim()
      .split(/\n{2,}/)
      .slice(1);
    if (!blocks.length || blocks.length > 500)
      throw new BadRequestException('Sous-titres vides ou trop nombreux.');
    for (const block of blocks) {
      const lines = block.split('\n');
      const timeLine = lines.findIndex((line) => line.includes('-->'));
      if (
        timeLine < 0 ||
        timeLine > 1 ||
        !/^(?:\d{2}:)?\d{2}:\d{2}\.\d{3} --> (?:\d{2}:)?\d{2}:\d{2}\.\d{3}$/.test(
          lines[timeLine],
        ) ||
        lines.length <= timeLine + 1
      )
        throw new BadRequestException(
          'Chaque sous-titre doit avoir un début, une fin et du texte.',
        );
      const [start, end] = lines[timeLine].split(' --> ').map((value) => {
        const parts = value.split(':').map(Number);
        const seconds = parts.pop()!,
          minutes = parts.pop()!,
          hours = parts.pop() || 0;
        if (minutes > 59 || seconds >= 60)
          throw new BadRequestException('Horodatage WebVTT invalide.');
        return hours * 3600 + minutes * 60 + seconds;
      });
      if (end <= start || end > (video.duration || 14400) + 1)
        throw new BadRequestException('Durée du sous-titre invalide.');
    }
    content = content.replace(/<[^>]*>/g, '');
    await this.videos.db.$transaction(async (tx) => {
      await lockActiveVideo(tx, id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'captions:' + id},0))`;
      const existing = await tx.videoCaption.findUnique({
        where: { videoId_language: { videoId: id, language } },
      });
      if (
        !existing &&
        (await tx.videoCaption.count({ where: { videoId: id } })) >= 3
      )
        throw new BadRequestException('Trois pistes maximum par vidéo.');
      await tx.videoCaption.upsert({
        where: { videoId_language: { videoId: id, language } },
        create: { videoId: id, language, label: body.label, content },
        update: { label: body.label, content },
      });
    });
    return { saved: true };
  }
  async remove(id: string, language: string, actor: Principal) {
    await this.videos.owned(id, actor);
    await this.videos.db.videoCaption.deleteMany({
      where: { videoId: id, language },
    });
    return { deleted: true };
  }
  async content(
    id: string,
    language: string,
    expires: number,
    signature: string,
  ) {
    this.videos.enabled();
    if (
      expires < Date.now() / 1000 ||
      expires > Date.now() / 1000 + 301 ||
      !/^[\w-]{43}$/.test(signature) ||
      !timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(this.signature(id, language, expires)),
      )
    )
      throw new NotFoundException();
    const v = await this.videos.db.video.findUnique({ where: { id } });
    if (!v || !['ready', 'published'].includes(v.status))
      throw new NotFoundException();
    const track = await this.videos.db.videoCaption.findUnique({
      where: { videoId_language: { videoId: id, language } },
    });
    if (!track) throw new NotFoundException();
    return track.content;
  }
}
