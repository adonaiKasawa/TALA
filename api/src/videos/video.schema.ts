import { z } from 'zod';
export const videoId = z.uuid();
export const editRecipe = z
  .object({
    start: z.number().finite().min(0).max(14400).default(0),
    end: z.number().finite().positive().max(14400).optional(),
    speed: z
      .union([z.literal(0.5), z.literal(1), z.literal(1.5), z.literal(2)])
      .default(1),
    muted: z.boolean().default(false),
    overlay: z.boolean().default(false),
  })
  .strict()
  .refine(
    (value) => value.end === undefined || value.end - value.start >= 0.25,
    { message: 'Conservez au moins un quart de seconde.' },
  );
const fields = z
  .object({
    title: z.string().trim().min(1).max(140),
    description: z.string().max(5000),
    visibility: z.enum(['public', 'unlisted', 'private']),
    kind: z.enum(['short', 'long']),
    thumbnailTime: z.number().finite().min(0).max(14400),
    language: z
      .string()
      .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/)
      .max(35),
    category: z.string().trim().max(60),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    allowDownload: z.boolean(),
    trial: z.boolean(),
  })
  .strict();
export const videoMetadata = fields.extend({
  description: fields.shape.description.default(''),
  visibility: fields.shape.visibility.default('private'),
  kind: fields.shape.kind.default('short'),
  thumbnailTime: fields.shape.thumbnailTime.default(0),
  language: fields.shape.language.default('und'),
  category: fields.shape.category.default(''),
  allowDownload: fields.shape.allowDownload.default(false),
  trial: fields.shape.trial.default(false),
});
export const createVideo = videoMetadata.extend({
  size: z.number().int().positive().max(1073741824),
  editRecipe: editRecipe
    .optional()
    .describe(
      'Montage fixé à la création : début/fin en secondes source, vitesse 0.5/1/1.5/2 et retrait du son. Appliqué par FFmpeg avant Mux. Non modifiable par PATCH.',
    ),
});
// PATCH must not inject creation defaults into unspecified fields.
export const patchVideo = fields.partial();
