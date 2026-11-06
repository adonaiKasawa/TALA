import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
export const feedQuery = z
  .object({
    kind: z.enum(['short', 'long']).default('short'),
    mode: z.enum(['latest', 'following', 'saved']).default('latest'),
    limit: z.coerce.number().int().min(1).max(20).default(10),
    cursor: z.string().max(800).optional(),
    category: z.string().max(60).optional(),
    language: z.string().max(35).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    video: z.uuid().optional(),
    creator: z
      .string()
      .regex(/^[a-zA-Z0-9_]{3,30}$/)
      .optional(),
    tag: z
      .string()
      .max(60)
      .regex(/^[\p{L}\p{N}_]+$/u)
      .optional(),
  })
  .strict();
export const reactionKind = z.enum(['like', 'save', 'not_interested']);
export const relationKind = z.enum(['follow', 'block', 'mute', 'restrict']);
export const commentBody = z
  .object({
    text: z.string().trim().min(1).max(1000),
    parentId: z.uuid().optional(),
  })
  .strict();
export const impressionBody = z
  .object({
    id: z.uuid(),
    videoId: z.uuid(),
    surface: z.enum(['short', 'long', 'watch']),
  })
  .strict();
export const watchBody = z
  .object({
    sequence: z.number().int().min(1).max(100000),
    event: z.enum([
      'play',
      'progress',
      'pause',
      'seek',
      'complete',
      'replay',
      'skip',
    ]),
    watchedMs: z.number().int().min(0).max(14400000),
    positionMs: z.number().int().min(0).max(14400000),
  })
  .strict();
export function hashtags(text: string) {
  return [
    ...new Set(
      Array.from(
        text.normalize('NFC').matchAll(/#([\p{L}\p{N}_]{1,60})/gu),
        (m) => m[1].toLowerCase(),
      ),
    ),
  ].slice(0, 30);
}
export function cursorEncode(id: string, at: Date, scope: string) {
  return Buffer.from(
    JSON.stringify({ id, at: at.toISOString(), scope }),
  ).toString('base64url');
}
export function cursorDecode(value: string | undefined, scope: string) {
  if (!value) return undefined;
  try {
    return z
      .object({ id: z.uuid(), at: z.iso.datetime(), scope: z.literal(scope) })
      .strict()
      .parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new BadRequestException('Curseur invalide pour ce fil.');
  }
}
