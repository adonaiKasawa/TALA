import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'authserver/package.json'));
const { parse } = require('dotenv');
const authEnv = parse(readFileSync(resolve(root, 'authserver/.env')));
const apiEnv = parse(readFileSync(resolve(root, 'api/.env')));
const file = resolve(root, 'web/.env.local');
let web = existsSync(file) ? parse(readFileSync(file)) : {};
web = { WEB_ORIGIN: 'http://localhost:3000', OIDC_ISSUER: authEnv.OIDC_ISSUER || 'http://localhost:4000', API_ORIGIN: 'http://localhost:4001', API_AUDIENCE: 'urn:tala:api', IDENTITY_AUDIENCE: 'urn:tala:identity', OIDC_CLIENT_ID: 'tala-web', OIDC_CLIENT_SECRET: randomBytes(32).toString('base64url'), WEB_DATABASE_URL: apiEnv.DATABASE_URL, WEB_SESSION_KEY: randomBytes(32).toString('hex'), ...web };
for (const name of ['WEB_ORIGIN', 'OIDC_ISSUER', 'API_ORIGIN']) {
  const url = new URL(web[name]);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`${name} : origine sans chemin requise.`);
}
process.env.AUTH_DATABASE_URL = authEnv.AUTH_DATABASE_URL;
const { Database } = require(resolve(root, 'authserver/dist/database/database.service.js'));
const { Vault } = require(resolve(root, 'authserver/dist/security/crypto.js'));
const { adapterFactory } = require(resolve(root, 'authserver/dist/oidc/persistence/postgres.adapter.js'));
const db = new Database();
try {
  const adapter = new (adapterFactory(db, new Vault(authEnv.AUTH_ENCRYPTION_KEY)))('Client');
  const existing = await adapter.find(web.OIDC_CLIENT_ID);
  if (existing && existing.client_secret !== web.OIDC_CLIENT_SECRET) throw new Error('Client web existant avec un autre secret : configuration conservée, intervention nécessaire.');
  const scope = 'openid profile email offline_access tala.api tala.identity';
  await adapter.upsert(web.OIDC_CLIENT_ID, { client_id: web.OIDC_CLIENT_ID, client_name: 'TALA Web', redirect_uris: [`${web.WEB_ORIGIN}/auth/callback`], post_logout_redirect_uris: [web.WEB_ORIGIN + '/'], response_types: ['code'], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'client_secret_basic', client_secret: web.OIDC_CLIENT_SECRET, scope }, 0);
  await adapter.upsert('tala-mobile', { client_id: 'tala-mobile', client_name: 'TALA Mobile', application_type: 'native', redirect_uris: ['tala://oauth/callback'], post_logout_redirect_uris: ['tala://oauth/logout'], response_types: ['code'], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'none', scope }, 0);
  writeFileSync(file, Object.entries(web).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: web.WEB_DATABASE_URL });
  try {
    await pool.query('CREATE SCHEMA IF NOT EXISTS tala_web');
    await pool.query('CREATE TABLE IF NOT EXISTS tala_web.sessions (id text PRIMARY KEY, kind text NOT NULL, payload text NOT NULL, expires_at timestamptz NOT NULL)');
    await pool.query('CREATE INDEX IF NOT EXISTS web_sessions_expiry ON tala_web.sessions (expires_at)');
  } finally { await pool.end(); }
  console.log('Clients web/mobile enregistrés ; session web initialisée. Secrets conservés dans web/.env.local, jamais affichés.');
} finally { await db.$disconnect(); }
