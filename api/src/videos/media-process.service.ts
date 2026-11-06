import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { editRecipe } from './video.schema.js';
import { copyFile, open, stat, rename, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { VideoConfig } from './video-config.service.js';
import { PrivateStorage } from './private-storage.service.js';
import type { Video } from '../generated/prisma/client.js';
type Probe = {
  format: { duration: string; format_name: string };
  streams: Array<{
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    pix_fmt?: string;
    color_transfer?: string;
    avg_frame_rate?: string;
    side_data_list?: Array<{ rotation?: number }>;
    disposition?: { attached_pic?: number };
  }>;
};
export class RejectedMedia extends Error {}
@Injectable()
export class MediaProcess {
  constructor(
    private readonly config: VideoConfig,
    private readonly storage: PrivateStorage,
  ) {}
  async run(
    executable: string,
    args: string[],
    signal?: AbortSignal,
    timeout = this.config.value.MEDIA_PROCESS_TIMEOUT_MS,
  ) {
    return new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(executable, args, {
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '',
          stderr = '',
          settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          if (error) {
            child.kill();
            reject(error);
          } else resolve({ stdout, stderr });
        };
        const abort = () => finish(new Error('MEDIA_CANCELLED'));
        const timer = setTimeout(
          () => finish(new Error('MEDIA_PROCESS_TIMEOUT')),
          timeout,
        );
        child.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
          if (stdout.length > 2097152)
            finish(new RejectedMedia('MEDIA_INVALID'));
        });
        child.stderr.on('data', (data: Buffer) => {
          stderr = (stderr + data.toString()).slice(-65536);
        });
        child.once('error', () => finish(new Error('MEDIA_TOOL_UNAVAILABLE')));
        child.once('exit', (code) =>
          finish(
            code === 0
              ? undefined
              : new RejectedMedia('MEDIA_INVALID', { cause: stderr }),
          ),
        );
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      },
    );
  }
  input(path: string) {
    return [
      '-protocol_whitelist',
      'file',
      '-format_whitelist',
      'mov,matroska,webm',
      '-i',
      path,
    ];
  }
  ffmpeg(args: string[], signal?: AbortSignal) {
    return this.run(
      this.config.value.FFMPEG_PATH,
      [
        '-nostdin',
        '-hide_banner',
        '-y',
        '-threads',
        '2',
        '-filter_threads',
        '1',
        '-filter_complex_threads',
        '1',
        '-max_alloc',
        '268435456',
        ...args,
      ],
      signal,
    );
  }
  async probe(path: string, signal?: AbortSignal): Promise<Probe> {
    try {
      return JSON.parse(
        (
          await this.run(
            this.config.value.FFPROBE_PATH,
            [
              '-v',
              'error',
              '-max_alloc',
              '67108864',
              '-probesize',
              '16777216',
              '-analyzeduration',
              '10000000',
              '-show_format',
              '-show_streams',
              '-of',
              'json',
              ...this.input(path),
            ],
            signal,
            30000,
          )
        ).stdout,
      ) as Probe;
    } catch (error) {
      if (error instanceof RejectedMedia || error instanceof SyntaxError)
        throw new RejectedMedia('MEDIA_INVALID');
      throw error;
    }
  }
  async analyze(v: Video, signal?: AbortSignal) {
    const source = await this.storage.path(v.id, 'source.bin'),
      file = await open(source, 'r');
    const head = Buffer.alloc(16);
    try {
      await file.read(head, 0, 16, 0);
    } finally {
      await file.close();
    }
    if (
      head.toString('ascii', 4, 8) !== 'ftyp' &&
      head.readUInt32BE(0) !== 0x1a45dfa3
    )
      throw new RejectedMedia('MEDIA_CONTAINER_UNSUPPORTED');
    if ((await stat(source)).size !== v.expectedBytes)
      throw new RejectedMedia('MEDIA_SIZE_MISMATCH');
    const probe = await this.probe(source, signal),
      videos = probe.streams.filter(
        (s) => s.codec_type === 'video' && !s.disposition?.attached_pic,
      ),
      audio = probe.streams.filter((s) => s.codec_type === 'audio');
    if (
      videos.length !== 1 ||
      audio.length > 1 ||
      probe.streams.some((s) => s.codec_type === 'subtitle')
    )
      throw new RejectedMedia('MEDIA_TRACKS_UNSUPPORTED');
    const video = videos[0],
      sourceDuration = Number(probe.format.duration),
      [n, d] = String(video.avg_frame_rate).split('/').map(Number),
      fps = n / d;
    if (
      !Number.isFinite(sourceDuration) ||
      sourceDuration <= 0 ||
      sourceDuration > this.config.value.MEDIA_MAX_DURATION
    )
      throw new RejectedMedia('MEDIA_DURATION_LIMIT');
    const recipe = editRecipe.parse(v.editRecipe || {});
    const end = Math.min(recipe.end ?? sourceDuration, sourceDuration);
    if (
      recipe.start >= end ||
      (recipe.end !== undefined && recipe.end > sourceDuration + 0.1)
    )
      throw new RejectedMedia('MEDIA_EDIT_RANGE');
    const duration = (end - recipe.start) / recipe.speed;
    if (
      duration > this.config.value.MEDIA_MAX_DURATION ||
      (v.kind === 'short' && duration > 180)
    )
      throw new RejectedMedia('MEDIA_DURATION_LIMIT');
    const editing =
      recipe.start > 0 ||
      end < sourceDuration - 0.001 ||
      recipe.speed !== 1 ||
      recipe.muted ||
      recipe.overlay;
    const videoFilters = `trim=start=${recipe.start}:end=${end},setpts=(PTS-STARTPTS)/${recipe.speed},fps=${fps}`;
    const audioFilters = `atrim=start=${recipe.start}:end=${end},asetpts=PTS-STARTPTS,atempo=${recipe.speed}`;
    if (
      !video.width ||
      !video.height ||
      video.width > 4096 ||
      video.height > 4096 ||
      video.width < 16 ||
      video.height < 16 ||
      !Number.isFinite(fps) ||
      fps <= 0 ||
      fps > 120
    )
      throw new RejectedMedia('MEDIA_DIMENSIONS_LIMIT');
    if (v.thumbnailTime >= duration)
      throw new RejectedMedia('MEDIA_THUMBNAIL_RANGE');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(source)) {
      if (signal?.aborted) throw new Error('MEDIA_CANCELLED');
      hash.update(chunk as Buffer);
    }
    const rotation =
      Math.abs(video.side_data_list?.find((s) => s.rotation)?.rotation || 0) %
      180;
    return {
      source,
      probe,
      video,
      audio,
      duration,
      editing,
      videoFilters,
      audioFilters,
      muted: recipe.muted,
      overlay: recipe.overlay,
      fps,
      width: rotation === 90 ? video.height : video.width,
      height: rotation === 90 ? video.width : video.height,
      sourceHash: hash.digest('hex'),
    };
  }
  async prepare(
    v: Video,
    info: Awaited<ReturnType<MediaProcess['analyze']>>,
    signal?: AbortSignal,
  ) {
    const output = await this.storage.path(v.id, 'prepared.mp4'),
      candidate = await this.storage.path(v.id, 'candidate.mp4');
    const overlayPath = info.overlay
      ? await this.storage.path(v.id, 'overlay.png')
      : null;
    const imageInput = overlayPath
      ? [
          '-protocol_whitelist',
          'file',
          '-f',
          'image2',
          '-pattern_type',
          'none',
          '-i',
          overlayPath,
        ]
      : [];
    const composition = (index: number, label: string) =>
      `[0:v:0]${info.videoFilters}[base];[${index}:v:0]scale=${info.width}:${info.height},format=rgba[art];[base][art]overlay=0:0:eof_action=repeat:format=auto,format=yuv420p[${label}]`;
    const hdr =
      ['smpte2084', 'arib-std-b67'].includes(info.video.color_transfer || '') ||
      /p(?:10|12|16)(?:le|be)?$/.test(info.video.pix_fmt || '');
    const canPreserveLocal =
      !hdr &&
      info.video.codec_name === 'h264' &&
      (!info.audio.length || info.audio[0].codec_name === 'aac') &&
      info.probe.format.format_name.includes('mov');
    if (hdr) {
      if (info.editing) throw new RejectedMedia('MEDIA_EDIT_HDR_UNSUPPORTED');
      if (v.driver === 'local')
        throw new RejectedMedia('MEDIA_HDR_REQUIRES_MUX');
      await this.ffmpeg(
        [
          '-v',
          'error',
          '-xerror',
          ...this.input(info.source),
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-f',
          'null',
          '-',
        ],
        signal,
      );
      await copyFile(info.source, output);
      return {
        optimization: 'original-hdr-v1',
        qualityScore: 1,
        preparedBytes: v.expectedBytes,
      };
    }
    await this.ffmpeg(
      [
        '-v',
        'error',
        '-xerror',
        ...this.input(info.source),
        ...imageInput,
        '-map',
        info.overlay ? '[edited]' : '0:v:0',
        ...(info.muted ? ['-an'] : ['-map', '0:a:0?']),
        ...(info.overlay
          ? [
              '-filter_complex',
              composition(1, 'edited'),
              ...(!info.muted && info.audio.length
                ? ['-af', info.audioFilters]
                : []),
            ]
          : info.editing
            ? [
                '-vf',
                info.videoFilters,
                ...(!info.muted && info.audio.length
                  ? ['-af', info.audioFilters]
                  : []),
              ]
            : []),
        '-map_metadata',
        '-1',
        '-c:v',
        'libx264',
        '-crf',
        info.editing ? '14' : '18',
        '-preset',
        'medium',
        '-pix_fmt',
        'yuv420p',
        '-threads',
        '2',
        '-c:a',
        !info.editing && info.audio[0]?.codec_name === 'aac' ? 'copy' : 'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-fs',
        String(Math.min(v.expectedBytes * 2, 1073741824)),
        candidate,
      ],
      signal,
    );
    const result = await this.probe(candidate, signal),
      stream = result.streams.find((s) => s.codec_type === 'video');
    if (
      !stream ||
      Math.abs(Number(result.format.duration) - info.duration) >
        Math.max(0.25, 2 / info.fps) ||
      stream.width !== info.width ||
      stream.height !== info.height
    )
      throw new RejectedMedia('MEDIA_OUTPUT_MISMATCH');
    const stats = await this.ffmpeg(
      [
        '-v',
        'info',
        '-xerror',
        ...this.input(info.source),
        ...this.input(candidate),
        ...imageInput,
        '-filter_complex',
        `${info.overlay ? composition(2, 'ref') : `[0:v:0]${info.editing ? info.videoFilters : 'setpts=PTS-STARTPTS'},format=yuv420p[ref]`};[1:v:0]setpts=PTS-STARTPTS,format=yuv420p[dist];[ref][dist]ssim`,
        '-an',
        '-f',
        'null',
        '-',
      ],
      signal,
    );
    const quality = Number(stats.stderr.match(/All:([0-9.]+)/)?.[1]);
    const size = (await stat(candidate)).size;
    if (
      !Number.isFinite(quality) ||
      quality < 0.985 ||
      (!info.editing && size > v.expectedBytes * 0.95)
    ) {
      if (info.editing) throw new RejectedMedia('MEDIA_QUALITY_CHECK_FAILED');
      if (canPreserveLocal || v.driver === 'mux') {
        await this.ffmpeg(
          [
            '-v',
            'error',
            '-xerror',
            ...this.input(info.source),
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
            '-f',
            'null',
            '-',
          ],
          signal,
        );
        await unlink(candidate);
        if (canPreserveLocal)
          await this.ffmpeg(
            [
              '-v',
              'error',
              '-xerror',
              ...this.input(info.source),
              '-map',
              '0:v:0',
              '-map',
              '0:a:0?',
              '-map_metadata',
              '-1',
              '-c',
              'copy',
              '-movflags',
              '+faststart',
              output,
            ],
            signal,
          );
        else await copyFile(info.source, output);
        return {
          optimization: 'original-preserved-v1',
          qualityScore: 1,
          preparedBytes: (await stat(output)).size,
        };
      }
      if (!Number.isFinite(quality) || quality < 0.985)
        throw new RejectedMedia('MEDIA_QUALITY_CHECK_FAILED');
    }
    await this.ffmpeg(
      [
        '-v',
        'error',
        '-xerror',
        ...this.input(candidate),
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-f',
        'null',
        '-',
      ],
      signal,
    );
    await rename(candidate, output);
    return {
      optimization: info.editing
        ? 'edit-h264-crf14-ssim-v1'
        : 'h264-crf18-ssim-v1',
      qualityScore: quality,
      preparedBytes: size,
    };
  }
  async thumbnail(v: Video, signal?: AbortSignal) {
    const input = await this.storage.path(v.id, 'prepared.mp4'),
      temp = await this.storage.path(v.id, 'poster.tmp.jpg');
    await this.ffmpeg(
      [
        '-v',
        'error',
        '-ss',
        String(v.thumbnailTime),
        ...this.input(input),
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-vf',
        'scale=480:480:force_original_aspect_ratio=decrease',
        '-q:v',
        '3',
        temp,
      ],
      signal,
    );
    if (!(await stat(temp)).size)
      throw new RejectedMedia('MEDIA_THUMBNAIL_FAILED');
    await rename(temp, await this.storage.path(v.id, 'poster.jpg'));
  }
}
