import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  Res,
  Query,
  BadRequestException,
  PayloadTooLargeException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  CurrentPrincipal,
  OptionalAuth,
  Public,
  type Principal,
} from '../auth/auth.metadata.js';
import { VideosService } from './videos.service.js';
import { MuxService } from './mux.service.js';
import { createVideo, patchVideo, videoId } from './video.schema.js';
import {
  CaptionsService,
  captionBody,
  captionLanguage,
} from './captions.service.js';
@Controller()
export class VideosController {
  constructor(
    private readonly videos: VideosService,
    private readonly mux: MuxService,
    private readonly captions: CaptionsService,
  ) {}
  @Get('me/videos') list(@CurrentPrincipal() actor: Principal) {
    return this.videos.list(actor);
  }
  @OptionalAuth() @Get('videos/:id/download') async download(
    @Param('id') id: string,
    @CurrentPrincipal() actor?: Principal,
  ) {
    const v = await this.videos.readable(videoId.parse(id), actor);
    if (!v.allowDownload)
      throw new ForbiddenException('Le créateur refuse le téléchargement.');
    if (v.driver !== 'mux')
      return {
        url: this.videos.localUrl(v.id, 'video'),
        type: 'mp4',
        expiresIn: 300,
      };
    return this.mux.download(v);
  }
  @Post('videos/:id/download/prepare') async prepareDownload(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    const v = await this.videos.owned(videoId.parse(id), actor);
    if (!v.allowDownload)
      throw new ForbiddenException('Activez les téléchargements.');
    if (!['ready', 'published'].includes(v.status))
      throw new ConflictException('Vidéo en préparation.');
    return v.driver === 'mux'
      ? this.mux.prepareDownload(v)
      : { status: 'ready' };
  }
  @Get('videos/options') options() {
    this.videos.enabled();
    return {
      driver: this.videos.config.value.MEDIA_DRIVER,
      queue: this.videos.config.value.MEDIA_QUEUE_DRIVER,
      maxBytes: this.videos.config.value.MEDIA_MAX_BYTES,
      chunkBytes: this.videos.config.chunkBytes,
      maxDuration: this.videos.config.value.MEDIA_MAX_DURATION,
      shortMaxDuration: 180,
      muxTest: this.videos.config.value.MUX_TEST_ASSETS === 'true',
    };
  }
  @Public() @Get('videos/public') publicList() {
    return this.videos.publicList();
  }
  @Post('videos') create(
    @CurrentPrincipal() actor: Principal,
    @Body() body: unknown,
  ) {
    return this.videos.create(actor, createVideo.parse(body));
  }
  @Get('videos/:id') async own(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.videos.view(await this.videos.owned(videoId.parse(id), actor));
  }
  @Patch('videos/:id') patch(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
    @Body() body: unknown,
  ) {
    return this.videos.patch(videoId.parse(id), actor, patchVideo.parse(body));
  }
  @Delete('videos/:id') remove(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.videos.remove(videoId.parse(id), actor);
  }
  @Put('videos/:id/content') async upload(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
    @Req() req: Request,
  ) {
    id = videoId.parse(id);
    await this.videos.owned(id, actor);
    if (req.get('content-type')?.split(';')[0] !== 'application/octet-stream')
      throw new BadRequestException('Un bloc vidéo binaire est requis.');
    const offset = z
      .string()
      .regex(/^\d{1,10}$/)
      .transform(Number)
      .parse(req.get('upload-offset'));
    const declared = Number(req.get('content-length'));
    if (declared > this.videos.config.chunkBytes)
      throw new PayloadTooLargeException('Bloc de 4 Mo maximum.');
    const parts: Buffer[] = [];
    let size = 0;
    const timeout = setTimeout(() => req.destroy(), 30000);
    timeout.unref();
    try {
      for await (const chunk of req) {
        const part: unknown = chunk;
        if (!Buffer.isBuffer(part) && typeof part !== 'string')
          throw new BadRequestException('Flux vidéo invalide.');
        const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
        size += bytes.length;
        if (size > this.videos.config.chunkBytes)
          throw new PayloadTooLargeException('Bloc de 4 Mo maximum.');
        parts.push(bytes);
      }
    } finally {
      clearTimeout(timeout);
    }
    return this.videos.upload(id, actor, offset, Buffer.concat(parts));
  }
  @Put('videos/:id/overlay') async overlay(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
    @Req() req: Request,
  ) {
    id = videoId.parse(id);
    await this.videos.owned(id, actor);
    if (req.get('content-type')?.split(';')[0] !== 'image/png')
      throw new BadRequestException('Un calque PNG est requis.');
    const limit = 4 * 1024 * 1024;
    if (Number(req.get('content-length')) > limit)
      throw new PayloadTooLargeException('Calque de 4 Mo maximum.');
    const parts: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => req.destroy(), 30000);
    timer.unref();
    try {
      for await (const chunk of req) {
        const part: unknown = chunk;
        if (!Buffer.isBuffer(part) && typeof part !== 'string')
          throw new BadRequestException('Flux PNG invalide.');
        const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
        size += bytes.length;
        if (size > limit)
          throw new PayloadTooLargeException('Calque de 4 Mo maximum.');
        parts.push(bytes);
      }
    } finally {
      clearTimeout(timer);
    }
    return this.videos.saveOverlay(id, actor, Buffer.concat(parts));
  }
  @Post('videos/:id/complete') complete(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.videos.complete(videoId.parse(id), actor);
  }
  @Post('videos/:id/publish') publish(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.videos.publish(videoId.parse(id), actor, true);
  }
  @Post('videos/:id/unpublish') unpublish(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.videos.publish(videoId.parse(id), actor, false);
  }
  @Post('videos/:id/retry') retry(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.videos.retry(videoId.parse(id), actor);
  }
  @OptionalAuth() @Get('videos/:id/playback') async playback(
    @Param('id') id: string,
    @CurrentPrincipal() actor?: Principal,
  ) {
    const v = await this.videos.readable(videoId.parse(id), actor);
    const playback =
      v.driver === 'mux'
        ? await this.mux.playback(v)
        : {
            url: this.videos.localUrl(v.id, 'video'),
            thumbnail: this.videos.localUrl(v.id, 'thumbnail'),
            type: 'mp4',
            expiresIn: 300,
          };
    return {
      video: this.videos.view(v),
      ...playback,
      captions: await this.captions.tracks(v.id),
    };
  }
  @Put('videos/:id/captions/:language') saveCaption(
    @Param('id') id: string,
    @Param('language') language: string,
    @Body() body: unknown,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.captions.save(
      videoId.parse(id),
      captionLanguage.parse(language),
      captionBody.parse(body),
      actor,
    );
  }
  @Delete('videos/:id/captions/:language') removeCaption(
    @Param('id') id: string,
    @Param('language') language: string,
    @CurrentPrincipal() actor: Principal,
  ) {
    return this.captions.remove(
      videoId.parse(id),
      captionLanguage.parse(language),
      actor,
    );
  }
  @Public() @Get('videos/:id/captions/:language') async readCaption(
    @Param('id') id: string,
    @Param('language') language: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const q = z
      .object({
        expires: z.coerce.number().int(),
        signature: z.string().max(100),
      })
      .parse(query);
    const text = await this.captions.content(
      videoId.parse(id),
      captionLanguage.parse(language),
      q.expires,
      q.signature,
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.type('text/vtt').send(text);
  }
  @Public() @Post('videos/mux/webhook') webhook(@Req() req: Request) {
    if (!Buffer.isBuffer(req.body))
      throw new BadRequestException('Corps brut requis.');
    return this.mux.webhook(
      req.body,
      z.string().max(2048).parse(req.get('mux-signature')),
    );
  }
  @Public() @Get('media/:id/:file') async media(
    @Param('id') id: string,
    @Param('file') file: string,
    @Query() query: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    id = videoId.parse(id);
    const kind = z.enum(['video', 'thumbnail']).parse(file);
    const q = z
      .object({
        expires: z.string().regex(/^\d+$/).transform(Number),
        signature: z.string().max(100),
      })
      .parse(query);
    const path = await this.videos.ticket(id, kind, q.expires, q.signature),
      size = await this.videos.storage.size(id, path);
    let start = 0,
      end = size - 1;
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Type',
      kind === 'video' ? 'video/mp4' : 'image/jpeg',
    );
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (range) {
        if (range[1]) {
          start = Number(range[1]);
          if (range[2]) end = Math.min(Number(range[2]), end);
        } else if (range[2]) start = Math.max(0, size - Number(range[2]));
        else start = -1;
      }
      if (
        !range ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start >= size ||
        end < start
      ) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`);
        res.end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    res.setHeader('Content-Length', end - start + 1);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = await this.videos.storage.stream(id, path, start, end);
    stream.once('error', () => res.destroy());
    res.once('close', () => stream.destroy());
    stream.pipe(res);
  }
}
