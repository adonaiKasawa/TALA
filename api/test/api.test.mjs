import 'dotenv/config';
import { parse } from 'dotenv';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT, decodeJwt } from 'jose';
const require = createRequire(import.meta.url);
const { createApiApp } = require('../dist/app.factory.js');
const { Database } = require('../dist/database/database.service.js');
const { createAuthApp } = require('../../authserver/dist/app.factory.js');
const { Database: AuthDatabase } = require('../../authserver/dist/database/database.service.js');
const { adapterFactory } = require('../../authserver/dist/oidc/persistence/postgres.adapter.js');
const { KeysService } = require('../../authserver/dist/keys/keys.service.js');

if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Tests réservés à PostgreSQL local non productif.');
const fixture = `api-e2e-${randomBytes(6).toString('hex')}`;
const clientId = fixture;
const userIds = [];
const apiRateKeys = ['read', 'write'].map(kind => createHash('sha256').update(`test:${kind}:127.0.0.1`).digest('hex'));
const authRateKeys = ['http', 'post'].map(kind => createHash('sha256').update(`test:${kind}:127.0.0.1`).digest('hex'));
let app, auth, db, authDb, apiBase, issuer, key, jwk, keyPath, client, tokenA, tokenB, idToken;
let userA, userB, username;

async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
class Browser {
  cookies = new Map();
  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set('cookie', [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; '));
    const response = await fetch(new URL(path, issuer), { ...options, headers, redirect: 'manual' });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], index = pair.indexOf('=');
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
}
async function login(user) {
  const browser = new Browser(), verifier = randomBytes(32).toString('base64url');
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: `${issuer}/test-callback`, response_type: 'code', scope: 'openid profile email tala.api', resource: process.env.API_AUDIENCE, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: fixture, nonce: randomBytes(16).toString('hex') });
  let response = await browser.request(`/auth?${query}`);
  for (let index = 0; index < 12; index++) {
    const location = response.headers.get('location'); assert.ok(location, `Redirection attendue (${response.status})`);
    const url = new URL(location, issuer);
    if (url.pathname === '/test-callback') {
      assert.equal(url.searchParams.get('error'), null);
      const exchanged = await fetch(`${issuer}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: `${issuer}/test-callback`, code: url.searchParams.get('code'), code_verifier: verifier, resource: process.env.API_AUDIENCE }) });
      assert.equal(exchanged.status, 200); return exchanged.json();
    }
    response = await browser.request(url);
    if (response.status === 200 && url.pathname.startsWith('/interaction/')) {
      const html = await response.text(), action = html.match(/<form method="post" action="([^"]+)"/)?.[1], csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
      assert.ok(action && csrf);
      response = await browser.request(action, { method: 'POST', headers: { origin: issuer, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf, ...(action.endsWith('/login') ? { email: user.email, password: 'PhraseDeTestAPI!45678', code: '' } : {}) }) });
    }
  }
  throw new Error('Connexion OIDC non terminée');
}
function api(path, method = 'GET', body, bearer = tokenA) {
  return fetch(`${apiBase}${path}`, { method, headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function signed(changes = {}, header = {}) {
  return new SignJWT({ ...decodeJwt(tokenA), ...changes }).setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: jwk.kid, ...header }).sign(key);
}

before(async () => {
  const authEnv = parse(readFileSync('../authserver/.env'));
  if (!process.env.TEST_AUTH_DATABASE_URL) throw new Error('Lancer cette suite avec scripts/test-api.mjs.');
  authEnv.AUTH_DATABASE_URL = process.env.TEST_AUTH_DATABASE_URL;
  if (new URL(authEnv.AUTH_DATABASE_URL).pathname === new URL(process.env.DATABASE_URL).pathname) throw new Error('Les bases des deux services doivent rester distinctes.');
  for (const [name, value] of Object.entries(authEnv)) if (name.startsWith('AUTH_') || name === 'MAIL_FROM') process.env[name] = value;
  process.env.NODE_ENV = 'test'; delete process.env.SMTP_URL; delete process.env.FEDERATION_PROVIDERS_PATH;
  issuer = process.env.OIDC_ISSUER = `http://127.0.0.1:${await freePort()}`;
  process.env.AUTH_PORT = String(new URL(issuer).port);
  process.env.AUTH_REVIEW_CLIENT_ID = `${fixture}-review`;
  process.env.AUTH_ADMIN_CLIENT_IDS = process.env.AUTH_REVIEW_CLIENT_ID;
  process.env.AUTH_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  process.env.AUTH_COOKIE_KEYS = randomBytes(48).toString('base64url');
  process.env.API_AUDIENCE ||= 'urn:tala:api';
  const keys = await generateKeyPair('RS256', { extractable: true }); key = keys.privateKey;
  jwk = { ...await exportJWK(key), kid: fixture, alg: 'RS256', use: 'sig' };
  mkdirSync('.local', { recursive: true }); keyPath = resolve(`.local/${fixture}.json`);
  writeFileSync(keyPath, JSON.stringify({ keys: [jwk] }), { flag: 'wx', mode: 0o600 }); process.env.AUTH_JWKS_PATH = keyPath;
  auth = await createAuthApp(); authDb = auth.get(AuthDatabase); await auth.listen(Number(process.env.AUTH_PORT), '127.0.0.1');
  await authDb.rateBucket.deleteMany({ where: { key: { in: authRateKeys } } });
  client = new (adapterFactory(authDb, auth.get(KeysService)))('Client');
  await client.upsert(clientId, { client_id: clientId, client_name: 'API integration', redirect_uris: [`${issuer}/test-callback`], response_types: ['code'], grant_types: ['authorization_code'], token_endpoint_auth_method: 'none', scope: 'openid profile email tala.api' }, 0);
  const { hash } = await import('../../authserver/node_modules/@node-rs/argon2/index.js');
  const passwordHash = await hash('PhraseDeTestAPI!45678', { memoryCost: 65536, timeCost: 3, parallelism: 1 });
  for (const suffix of ['a', 'b']) {
    const user = await authDb.user.create({ data: { email: `${fixture}-${suffix}@example.test`, username: `${fixture}-${suffix}`, passwordHash, emailVerified: true } });
    userIds.push(user.id); if (suffix === 'a') userA = user; else userB = user;
  }
  const resultA = await login(userA), resultB = await login(userB);
  tokenA = resultA.access_token; tokenB = resultB.access_token; idToken = resultA.id_token;
  app = await createApiApp(); db = app.get(Database); await app.listen(0, '127.0.0.1');
  apiBase = `${await app.getUrl()}/api/v1`;
  username = `${fixture.replaceAll('-', '_')}_a`;
});
beforeEach(async () => { if (db) await db.rateBucket.deleteMany({ where: { key: { in: apiRateKeys } } }); });
after(async () => {
  if (db) {
    await db.profile.deleteMany({ where: { issuer, subject: { in: userIds } } });
    await db.rateBucket.deleteMany({ where: { key: { in: apiRateKeys } } });
  }
  if (app) await app.close();
  if (authDb) {
    await authDb.oidcArtifact.deleteMany({ where: { OR: [{ accountId: { in: userIds } }, { model: 'Client', id: { in: [clientId, `${fixture}-review`] } }] } });
    await authDb.auditEvent.deleteMany({ where: { userId: { in: userIds } } });
    await authDb.rateBucket.deleteMany({ where: { key: { in: authRateKeys } } });
    await authDb.user.deleteMany({ where: { id: { in: userIds } } });
  }
  if (auth) await auth.close();
  if (keyPath) unlinkSync(keyPath);
});

test('API disponible, PostgreSQL séparé et Swagger sans secrets', async () => {
  assert.equal((await api('/health/ready', 'GET', undefined, null)).status, 200);
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, new URL(process.env.DATABASE_URL).pathname.slice(1));
  const docs = await fetch(`${await app.getUrl()}/docs`); assert.equal(docs.status, 200); assert.ok(docs.headers.get('content-security-policy'));
  const spec = await (await fetch(`${await app.getUrl()}/docs-json`)).json(); assert.ok(spec.paths['/me/profile'].post.requestBody);
  assert.ok(!JSON.stringify(spec).includes(process.env.DATABASE_URL));
});
test('JWT réellement émis par AuthServer et absence de profil au premier accès', async () => {
  assert.equal(decodeJwt(tokenA).aud, process.env.API_AUDIENCE);
  assert.equal((await api('/me/profile')).status, 404);
});
test('Refus des ID tokens, tokens altérés, expirés, autres issuers/audiences/types/scopes et machines', async () => {
  const missing = await api('/me/profile', 'GET', undefined, null); assert.equal(missing.status, 401); assert.ok(missing.headers.get('www-authenticate'));
  for (const bearer of [idToken, tokenA.slice(0, -12) + 'tampered', await signed({ aud: 'urn:tala:identity' }), await signed({ iss: 'https://untrusted.example' }), await signed({ exp: 1 }), await signed({}, { typ: 'JWT' }), await signed({ iat: Math.floor(Date.now() / 1000) + 300 })]) assert.equal((await api('/me/profile', 'GET', undefined, bearer)).status, 401);
  for (const claims of [{ scope: 'tala.identity' }, { sid: null, gid: null, sub: 'service-client' }]) assert.equal((await api('/me/profile', 'GET', undefined, await signed(claims))).status, 403);
});
test('Création du profil lié au sub, unicité du compte et pseudonyme normalisé', async () => {
  const response = await api('/me/profile', 'POST', { username: username.toUpperCase(), displayName: 'Créateur TALA', avatarUrl: 'https://images.example.test/avatar.jpg', bio: 'Mes créations', links: [{ label: 'Mon site', url: 'https://example.test' }], languages: ['fr', 'ln-CD'], country: 'cd', interests: ['Musique'], locale: 'fr-CD' });
  assert.equal(response.status, 201); const profile = await response.json(); assert.equal(profile.username, username); assert.equal(profile.preferences.country, 'CD'); assert.equal(profile.preferences.interests[0], 'musique'); assert.equal(profile.issuer, undefined); assert.equal(profile.subject, undefined);
  const row = await db.profile.findUnique({ where: { username } }); assert.equal(row.subject, userA.id); assert.equal(row.issuer, issuer);
  assert.equal((await api('/me/profile', 'POST', { username: `${username}x`, displayName: 'Duplicate' })).status, 409);
  assert.equal((await api('/me/profile', 'POST', { username: username.toUpperCase(), displayName: 'Other' }, tokenB)).status, 409);
});
test('Rotation JWKS de l’AuthServer : nouvelles et anciennes signatures acceptées', async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  const nextKey = { ...await exportJWK(pair.privateKey), kid: `${fixture}-rotated`, alg: 'RS256', use: 'sig' };
  writeFileSync(keyPath, JSON.stringify({ keys: [nextKey, jwk] }), { mode: 0o600 });
  await auth.close(); auth = await createAuthApp(); authDb = auth.get(AuthDatabase); await auth.listen(Number(process.env.AUTH_PORT), '127.0.0.1');
  const renewed = await login(userA);
  await new Promise(resolve => setTimeout(resolve, 5100));
  assert.equal((await api('/me/profile', 'GET', undefined, renewed.access_token)).status, 200);
  assert.equal((await api('/me/profile')).status, 200);
});
test('Consultation publique sans préférences ni identifiants', async () => {
  const response = await api(`/profiles/${username}`, 'GET', undefined, null); assert.equal(response.status, 200);
  const profile = await response.json(); assert.equal(profile.bio, 'Mes créations'); assert.equal(profile.preferences, undefined); assert.equal(profile.issuer, undefined); assert.equal(profile.subject, undefined);
});
test('Profil privé : détails masqués aux visiteurs, préférences réservées au propriétaire', async () => {
  assert.equal((await api('/me/profile', 'PATCH', { isPrivate: true })).status, 200);
  for (const bearer of [null, tokenB]) {
    const profile = await (await api(`/profiles/${username}`, 'GET', undefined, bearer)).json();
    assert.equal(profile.isPrivate, true); assert.equal(profile.bio, undefined); assert.equal(profile.links, undefined); assert.equal(profile.preferences, undefined);
  }
  const own = await (await api(`/profiles/${username}`)).json(); assert.equal(own.bio, 'Mes créations'); assert.equal(own.preferences.country, 'CD');
});
test('Modification partielle conserve confidentialité et préférences ; isolation entre utilisateurs', async () => {
  assert.equal((await api('/me/profile', 'PATCH', { bio: 'Nouvelle bio' })).status, 200);
  const own = await (await api('/me/profile')).json(); assert.equal(own.isPrivate, true); assert.deepEqual(own.preferences.languages, ['fr', 'ln-CD']); assert.equal(own.preferences.country, 'CD');
  assert.equal((await api('/me/profile', 'PATCH', { bio: 'Intrusion' }, tokenB)).status, 404);
  assert.equal((await api(`/profiles/${username}`, 'PATCH', { bio: 'Intrusion' }, tokenB)).status, 404);
  assert.equal((await (await api('/me/profile')).json()).bio, 'Nouvelle bio');
});
test('Validation stricte des champs, liens, limites et interdiction de choisir son identité/rôle', async () => {
  for (const body of [{}, { subject: userB.id }, { role: 'admin' }, { isPrivate: 'false' }, { bio: 'x'.repeat(501) }, { avatarUrl: 'javascript:alert(1)' }, { links: [{ label: 'Bad', url: 'http://example.test' }] }, { languages: ['not_a_language'] }, { interests: ['a', 'A'] }]) assert.equal((await api('/me/profile', 'PATCH', body)).status, 400);
  const bad = await api('/me/profile', 'PATCH', { passwordHash: 'x' }); assert.ok(!(await bad.text()).includes('Prisma'));
  assert.equal((await api(`/profiles/${username}`, 'GET', undefined, 'malformed')).status, 401);
  const oversized = await api('/me/profile', 'PATCH', { bio: 'x'.repeat(40000) }); assert.equal(oversized.status, 413);
});
test('Unicité du pseudonyme en concurrence et persistance après redémarrage', async () => {
  const bName = `${fixture.replaceAll('-', '_')}_b`;
  const responses = await Promise.all([api('/me/profile', 'POST', { username: bName, displayName: 'B' }, tokenB), api('/me/profile', 'POST', { username: bName.toUpperCase(), displayName: 'B' }, tokenB)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  await app.close(); app = await createApiApp(); db = app.get(Database); await app.listen(0, '127.0.0.1'); apiBase = `${await app.getUrl()}/api/v1`;
  assert.equal((await (await api('/me/profile')).json()).username, username);
});
test('Limites partagées renvoient 429 sans désactiver la protection des profils', async () => {
  await db.rateBucket.upsert({ where: { key: apiRateKeys[1] }, create: { key: apiRateKeys[1], count: 30, expiresAt: new Date(Date.now() + 60000) }, update: { count: 30, expiresAt: new Date(Date.now() + 60000) } });
  const response = await api('/me/profile', 'PATCH', { bio: 'Refus' }); assert.equal(response.status, 429); assert.ok(response.headers.get('retry-after'));
});
test('Suppression idempotente du profil propriétaire sans supprimer l’identité ou un autre profil', async () => {
  assert.equal((await api('/me/profile', 'DELETE')).status, 200);
  assert.equal((await api('/me/profile', 'DELETE')).status, 200);
  assert.equal((await api('/me/profile')).status, 404);
  assert.equal((await api('/me/profile', 'GET', undefined, tokenB)).status, 200);
  assert.ok(await authDb.user.findUnique({ where: { id: userA.id } }));
});
