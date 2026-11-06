import { z } from 'zod';

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_][a-z0-9_.]{1,28}[a-z0-9_]$/,
    'Pseudonyme de 3 a 30 caracteres : lettres, chiffres, point ou underscore.',
  );
const httpsUrl = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Une URL HTTPS sans identifiants est requise.');
const language = z
  .string()
  .min(2)
  .max(35)
  .refine((value) => {
    try {
      return Boolean(Intl.getCanonicalLocales(value)[0]);
    } catch {
      return false;
    }
  }, 'Code de langue invalide.')
  .transform((value) => Intl.getCanonicalLocales(value)[0]);
const unique = (values: string[]) => new Set(values).size === values.length;

const fields = {
  username,
  displayName: z.string().trim().min(1).max(80),
  avatarUrl: httpsUrl.nullable().optional(),
  bio: z.string().trim().max(500),
  links: z
    .array(
      z.strictObject({
        label: z.string().trim().min(1).max(40),
        url: httpsUrl,
      }),
    )
    .max(5),
  isPrivate: z.boolean(),
  languages: z.array(language).max(10).refine(unique, 'Langues dupliquees.'),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  interests: z
    .array(z.string().trim().toLowerCase().min(1).max(40))
    .max(20)
    .refine(unique, 'Centres d’interet dupliques.'),
  locale: language,
};
export const createProfile = z.strictObject({
  ...fields,
  bio: fields.bio.default(''),
  links: fields.links.default([]),
  isPrivate: fields.isPrivate.default(false),
  languages: fields.languages.default([]),
  interests: fields.interests.default([]),
  locale: fields.locale.default('fr'),
});
// Partial updates must not apply the creation defaults to omitted fields.
export const updateProfile = z
  .strictObject(fields)
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Indiquer au moins un champ a modifier.',
  );
export type CreateProfile = z.infer<typeof createProfile>;
export type UpdateProfile = z.infer<typeof updateProfile>;
export const profileUsername = username;
