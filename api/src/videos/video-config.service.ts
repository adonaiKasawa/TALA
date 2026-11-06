import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { resolve } from 'node:path';
const env = z.object({
  MEDIA_ENABLED: z.enum(['true', 'false']).default('false'),
  MEDIA_DRIVER: z.enum(['local', 'mux']).default('local'),
  MEDIA_ROOT: z.string().default('.local/media'),
  MEDIA_ORIGIN: z.url().default('http://localhost:4001'),
  MEDIA_SIGNING_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
  REDIS_URL: z.url().default('redis://127.0.0.1:6379'),
  MEDIA_QUEUE: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default('tala-media'),
  MEDIA_QUEUE_DRIVER: z.enum(['postgres', 'redis']).default('postgres'),
  MEDIA_WORKER_ISSUER: z.string().optional(),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  MEDIA_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(1073741824)
    .default(536870912),
  MEDIA_DAILY_BYTES: z.coerce.number().int().positive().default(2147483648),
  MEDIA_DAILY_UPLOADS: z.coerce.number().int().positive().default(20),
  MEDIA_MAX_DURATION: z.coerce.number().positive().max(14400).default(3600),
  MEDIA_PROCESS_TIMEOUT_MS: z.coerce.number().int().positive().default(3600000),
  MUX_TOKEN_ID: z.string().optional(),
  MUX_TOKEN_SECRET: z.string().optional(),
  MUX_WEBHOOK_SECRET: z.string().optional(),
  MUX_SIGNING_KEY_ID: z.string().optional(),
  MUX_SIGNING_PRIVATE_KEY_PATH: z.string().optional(),
  MUX_TEST_ASSETS: z.enum(['true', 'false']).default('true'),
});
@Injectable()
export class VideoConfig {
  readonly value: z.infer<typeof env>;
  readonly chunkBytes = 4 * 1024 * 1024;
  constructor() {
    const parsed = env.safeParse(process.env);
    if (!parsed.success)
      throw new Error(
        'Configuration média invalide : ' +
          parsed.error.issues.map((i) => i.path.join('.')).join(', '),
      );
    this.value = parsed.data;
    if (this.value.MEDIA_WORKER_ISSUER && process.env.NODE_ENV !== 'test')
      throw new Error(
        'Le périmètre du worker est réservé aux fixtures de test.',
      );
    this.value.MEDIA_ROOT = resolve(this.value.MEDIA_ROOT);
    const origin = new URL(this.value.MEDIA_ORIGIN);
    if (
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      !['http:', 'https:'].includes(origin.protocol)
    )
      throw new Error('MEDIA_ORIGIN doit être une origine sans chemin.');
    if (this.enabled && !this.value.MEDIA_SIGNING_KEY)
      throw new Error('MEDIA_SIGNING_KEY requise.');
    if (
      this.enabled &&
      process.env.NODE_ENV === 'production' &&
      (this.value.MEDIA_DRIVER !== 'mux' ||
        this.value.MEDIA_QUEUE_DRIVER !== 'redis' ||
        origin.protocol !== 'https:' ||
        this.value.MUX_TEST_ASSETS !== 'false' ||
        !this.value.MUX_WEBHOOK_SECRET)
    )
      throw new Error(
        'Production média : Mux, Redis, webhooks, HTTPS et assets hors test requis.',
      );
    if (
      this.enabled &&
      this.value.MEDIA_DRIVER === 'mux' &&
      [
        'MUX_TOKEN_ID',
        'MUX_TOKEN_SECRET',
        'MUX_SIGNING_KEY_ID',
        'MUX_SIGNING_PRIVATE_KEY_PATH',
      ].some((k) => !this.value[k])
    )
      throw new Error('Configuration Mux incomplète.');
  }
  get enabled() {
    return this.value.MEDIA_ENABLED === 'true';
  }
  connection() {
    const url = new URL(this.value.REDIS_URL);
    if (!['redis:', 'rediss:'].includes(url.protocol))
      throw new Error('REDIS_URL invalide.');
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: Number(url.pathname.slice(1) || 0),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    };
  }
}
