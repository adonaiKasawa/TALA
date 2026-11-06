import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//),
  OIDC_ISSUER: z.url().default('http://localhost:4000'),
  API_AUDIENCE: z.string().min(1).default('urn:tala:api'),
  IDENTITY_SYNC_KEY: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  ),
});

@Injectable()
export class ConfigService {
  readonly value: z.infer<typeof schema>;

  constructor() {
    const result = schema.safeParse(process.env);
    if (!result.success)
      throw new Error(
        `Configuration API invalide : ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      );
    this.value = result.data;
    if (this.value.NODE_ENV === 'production' && !this.value.IDENTITY_SYNC_KEY)
      throw new Error('IDENTITY_SYNC_KEY requise en production.');
    const issuer = new URL(this.value.OIDC_ISSUER);
    if (
      issuer.username ||
      issuer.password ||
      issuer.search ||
      issuer.hash ||
      issuer.pathname !== '/' ||
      !['http:', 'https:'].includes(issuer.protocol)
    )
      throw new Error(
        'OIDC_ISSUER doit etre une origine de confiance sans chemin',
      );
    if (
      issuer.protocol !== 'https:' &&
      (this.value.NODE_ENV === 'production' ||
        !['localhost', '127.0.0.1', '[::1]'].includes(issuer.hostname))
    )
      throw new Error('HTTPS requis pour l’issuer hors developpement local');
    this.value.OIDC_ISSUER = issuer.origin;
  }
}
