import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  AUTH_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  OIDC_ISSUER: z.url().default('http://localhost:4000'),
  API_AUDIENCE: z.string().min(1).default('urn:tala:api'),
  IDENTITY_AUDIENCE: z.string().min(1).default('urn:tala:identity'),
  AUTH_ADMIN_CLIENT_IDS: z.string().default('tala-review'),
  AUTH_APPLICATION_CLIENT_IDS: z.string().default('tala-web,tala-mobile'),
  AUTH_WEB_ORIGIN: z.url().default('http://localhost:3000'),
  AUTH_REVIEW_CLIENT_ID: z
    .string()
    .regex(/^[a-z0-9_-]{3,80}$/)
    .default('tala-review'),
  AUTH_ACCESS_TOKEN_TTL: z.coerce.number().int().min(60).max(900).default(300),
  AUTH_CODE_TTL: z.coerce.number().int().min(10).max(120).default(60),
  AUTH_REFRESH_ABSOLUTE_TTL: z.coerce
    .number()
    .int()
    .min(300)
    .max(2592000)
    .default(1209600),
  AUTH_REFRESH_IDLE_TTL: z.coerce
    .number()
    .int()
    .min(300)
    .max(2592000)
    .default(604800),
  AUTH_DATABASE_URL: z.string().startsWith('postgres'),
  AUTH_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  AUTH_COOKIE_KEYS: z.string().min(43),
  AUTH_JWKS_PATH: z.string().min(1),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.email().default('identity@tala.example'),
  HOST: z.string().default('127.0.0.1'),
  AUTH_TRUST_PROXY: z.string().optional(),
  FEDERATION_PROVIDERS_PATH: z.string().optional(),
  IDENTITY_SYNC_KEY: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  ),
});
export type AuthConfig = ReturnType<typeof loadConfig>;
export function loadConfig() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success)
    throw new Error(
      `Configuration invalide : ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  const c = parsed.data;
  if (c.NODE_ENV === 'production' && !c.IDENTITY_SYNC_KEY)
    throw new Error('IDENTITY_SYNC_KEY requise en production.');
  if (c.IDENTITY_AUDIENCE === c.API_AUDIENCE)
    throw new Error('Les audiences identite et API doivent etre distinctes');
  if (c.AUTH_REFRESH_IDLE_TTL > c.AUTH_REFRESH_ABSOLUTE_TTL)
    throw new Error('La duree inactive du refresh depasse sa duree absolue');
  if (
    c.NODE_ENV === 'production' &&
    (!c.OIDC_ISSUER.startsWith('https://') || !c.SMTP_URL)
  )
    throw new Error('Production : HTTPS et SMTP obligatoires');
  const issuer = c.OIDC_ISSUER.replace(/\/$/, '');
  const webOrigin = new URL(c.AUTH_WEB_ORIGIN);
  if (
    webOrigin.username ||
    webOrigin.password ||
    webOrigin.pathname !== '/' ||
    webOrigin.search ||
    webOrigin.hash ||
    !['http:', 'https:'].includes(webOrigin.protocol) ||
    (c.NODE_ENV === 'production' && webOrigin.protocol !== 'https:')
  )
    throw new Error('AUTH_WEB_ORIGIN invalide');
  const url = new URL(issuer);
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error('Issuer doit être une origine sans chemin');
  const jwks = z
    .object({
      keys: z
        .array(
          z.object({
            kty: z.literal('RSA'),
            kid: z.string().min(1),
            alg: z.literal('RS256'),
            use: z.literal('sig'),
            n: z.string(),
            e: z.string(),
            d: z.string(),
            p: z.string(),
            q: z.string(),
            dp: z.string(),
            dq: z.string(),
            qi: z.string(),
          }),
        )
        .min(1),
    })
    .parse(
      JSON.parse(readFileSync(resolve(c.AUTH_JWKS_PATH), 'utf8')) as unknown,
    );
  if (
    !Array.isArray(jwks.keys) ||
    !jwks.keys.some(
      (k: Record<string, unknown>) => k.d && k.kid && k.alg === 'RS256',
    )
  )
    throw new Error('Clé privée RS256 persistante requise');
  return {
    ...c,
    adminClientIds: c.AUTH_ADMIN_CLIENT_IDS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    issuer,
    secure: url.protocol === 'https:',
    jwks,
    cookieKeys: c.AUTH_COOKIE_KEYS.split(','),
  };
}
