import 'dotenv/config';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { TOTP } from 'otpauth';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fork, execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT, importJWK, decodeJwt } from 'jose';
const require = createRequire(import.meta.url);
const { createAuthApp } = require('../dist/app.factory.js');
const { Database } = require('../dist/database/database.service.js');
const { KeysService } = require('../dist/keys/keys.service.js');
const { MfaService } = require('../dist/mfa/mfa.service.js');
const { SessionsService } = require('../dist/sessions/sessions.service.js');
const { RateLimitService } = require('../dist/security/rate-limit.service.js');
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(new URL(process.env.OIDC_ISSUER).hostname)) throw new Error('Tests réservés à un environnement local non productif.');
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
process.env.AUTH_PORT = String(listener.address().port);
await new Promise(resolve => listener.close(resolve));
const base = process.env.OIDC_ISSUER = `http://127.0.0.1:${process.env.AUTH_PORT}`;
const reviewClientId = process.env.AUTH_REVIEW_CLIENT_ID = `e2e-review-${randomBytes(6).toString('hex')}`;
process.env.AUTH_ADMIN_CLIENT_IDS = reviewClientId;
const nativeClientId = `e2e-native-${randomBytes(6).toString('hex')}`;
process.env.AUTH_APPLICATION_CLIENT_IDS = nativeClientId;
const identityAudience = process.env.IDENTITY_AUDIENCE || 'urn:tala:identity';
process.env.NODE_ENV = 'test';
const email = `e2e-${randomBytes(6).toString('hex')}@example.test`;
let password = 'UnePhraseDeTest!45678';
let app, identity, userId, access, refresh, recovery, secret, mock, providerPath, externalUser, testKeysPath;
const children = new Set();
function services() {
  return {
    db: app.get(Database), vault: app.get(KeysService),
    checkMfa: (...args) => app.get(MfaService).checkMfa(...args),
    revokeUser: (...args) => app.get(SessionsService).revokeUser(...args),
    limit: (...args) => app.get(RateLimitService).check(...args),
  };
}
async function startInstance() {
  const child = fork(new URL('./instance.mjs', import.meta.url), [], { execPath: process.execPath, env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  children.add(child);
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Instance non disponible après 20s')), 20000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Instance arrêtée (${code})`)); });
    child.once('message', message => { clearTimeout(timeout); resolve(message.port); });
  });
  return { child, base: `http://127.0.0.1:${port}` };
}
async function stopInstance(child) {
  if (child.exitCode !== null) { children.delete(child); return; }
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Arrêt de l’instance trop lent')); }, 15000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
    child.send('stop');
  });
  children.delete(child);
}
function remoteLimit(child, key) {
  const id = randomBytes(8).toString('hex');
  return new Promise(resolve => {
    const receive = result => { if (result.id === id) { child.off('message', receive); resolve(result.ok); } };
    child.on('message', receive); child.send({ task: 'limit', key, id });
  });
}
const externalEmail = `external-${randomBytes(6).toString('hex')}@example.test`;
const ownedClients = [reviewClientId, nativeClientId];
const ownedRateKeys = ['http:127.0.0.1', 'post:127.0.0.1', `login:${email}`, `action:reset:${email}`, `action:verify:${email}`].map(key => createHash('sha256').update(`test:${key}`).digest('hex'));
class Browser {
  cookies = new Map();
  async request(path, options = {}) {
    const url = new URL(path, base);
    const headers = new Headers(options.headers);
    headers.set('cookie', [...this.cookies.values()].filter(c => url.pathname.startsWith(c.path)).map(c => `${c.name}=${c.value}`).join('; '));
    const response = await fetch(url, { ...options, headers, redirect: 'manual' });
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(';'); const index = pair.indexOf('=');
      const name = pair.slice(0, index), value = pair.slice(index + 1);
      const path = attrs.find(a => a.trim().toLowerCase().startsWith('path='))?.trim().slice(5) || '/';
      const key = `${name}:${path}`;
      if (!value || attrs.some(a => a.trim().toLowerCase() === 'max-age=0')) this.cookies.delete(key);
      else this.cookies.set(key, { name, value, path });
    }
    return response;
  }
  async csrf() { return (await (await this.request('/account/csrf')).json()).csrf; }
  async post(path, body) {
    const csrf = await this.csrf();
    return this.request(path, { method: 'POST', headers: { 'content-type': 'application/json', 'origin': base }, body: JSON.stringify({ ...body, csrf }) });
  }
}
async function account(path, body, method = 'POST', bearer = access) {
  return fetch(new URL(path, base), { method, headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
}
async function actionToken(kind) {
  const row = await identity.db.mail.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const content = identity.vault.open(row.content);
  assert.ok(content.text.includes(kind === 'reset' ? 'reset-password' : 'verify-email'));
  return new URL(content.text).searchParams.get('token');
}
async function authorization(loginCode, federated = false, custom = {}) {
  const browser = new Browser();
  const verifier = randomBytes(32).toString('base64url');
  const query = new URLSearchParams({ client_id: reviewClientId, redirect_uri: `${base}/review/callback`, response_type: 'code', scope: 'openid profile email offline_access tala.identity tala.admin', prompt: 'consent', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: randomBytes(16).toString('hex'), nonce: randomBytes(16).toString('hex'), resource: identityAudience });
  if (custom.clientId) query.set('client_id', custom.clientId);
  if (custom.redirectUri) query.set('redirect_uri', custom.redirectUri);
  if (custom.scope) query.set('scope', custom.scope);
  if (custom.omitResource) query.delete('resource');
  let response = await browser.request(`/auth?${query}`);
  for (let i = 0; i < 12; i++) {
    const location = response.headers.get('location');
    assert.ok(location, `Redirect attendu, reçu ${response.status}`);
    const url = new URL(location, base);
    if (url.pathname === '/review/callback' || (custom.redirectUri && url.href.split('?')[0] === custom.redirectUri)) { assert.equal(url.searchParams.get('error'), null); return { code: url.searchParams.get('code'), verifier, browser }; }
    response = federated === 'form_post' && url.pathname === '/federation/mock/callback'
      ? await browser.request(new URL(url.pathname, base).toString(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: url.searchParams })
      : await browser.request(url.toString());
    if (response.status === 200 && url.pathname.startsWith('/interaction/')) {
      if (federated && !url.pathname.endsWith('federation-finish')) {
        const html = await response.clone().text();
        if (html.includes('/login"')) { response = await browser.request(`${url.pathname}/federation/mock`); continue; }
      }
      const html = await response.text();
      const action = html.match(/<form method="post" action="([^"]+)"/)?.[1];
      const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
      assert.ok(action && csrf, 'Formulaire interaction présent');
      const body = new URLSearchParams({ csrf, ...(action.endsWith('/login') ? { email, password, code: loginCode || '' } : {}) });
      response = await browser.request(action, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base }, body });
    }
  }
  throw new Error('Boucle de connexion');
}
function exchange(flow, override = {}) {
  return fetch(`${base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: reviewClientId, redirect_uri: `${base}/review/callback`, grant_type: 'authorization_code', code: flow.code, code_verifier: flow.verifier, resource: identityAudience, ...override }) });
}
async function login(code) { const response = await exchange(await authorization(code)); assert.equal(response.status, 200); return response.json(); }
before(async () => {
  testKeysPath = resolve(`.local/e2e-jwks-${randomBytes(6).toString('hex')}.json`);
  writeFileSync(testKeysPath, readFileSync(process.env.AUTH_JWKS_PATH), { flag: 'wx', mode: 0o600 });
  process.env.AUTH_JWKS_PATH = testKeysPath;
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'mock-key', alg: 'RS256', use: 'sig' };
  const codes = new Map();
  let issuer;
  mock = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, issuer);
      res.setHeader('content-type', 'application/json');
      if (url.pathname === '/.well-known/openid-configuration') return res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'] }));
      if (url.pathname === '/jwks') return res.end(JSON.stringify({ keys: [jwk] }));
      if (url.pathname === '/authorize') {
        assert.equal(url.searchParams.get('client_id'), 'mock-client');
        assert.equal(url.searchParams.get('redirect_uri'), `${base}/federation/mock/callback`);
        const code = randomBytes(24).toString('hex'); codes.set(code, Object.fromEntries(url.searchParams));
        const target = new URL(url.searchParams.get('redirect_uri')); target.searchParams.set('code', code); target.searchParams.set('state', url.searchParams.get('state'));
        res.writeHead(302, { location: target.toString() }); return res.end();
      }
      if (url.pathname === '/token') {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const params = new URLSearchParams(raw), data = codes.get(params.get('code'));
        if (!data || createHash('sha256').update(params.get('code_verifier') || '').digest('base64url') !== data.code_challenge) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'invalid_grant' })); }
        codes.delete(params.get('code'));
        const idToken = await new SignJWT({ sub: 'external-test-subject', email: externalEmail, email_verified: true, nonce: data.nonce }).setProtectedHeader({ alg: 'RS256', kid: 'mock-key' }).setIssuer(issuer).setAudience('mock-client').setIssuedAt().setExpirationTime('5m').sign(privateKey);
        return res.end(JSON.stringify({ access_token: randomBytes(32).toString('hex'), token_type: 'Bearer', expires_in: 300, id_token: idToken }));
      }
      res.statusCode = 404; res.end('{}');
    } catch { res.statusCode = 500; res.end('{}'); }
  });
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${mock.address().port}`;
  providerPath = resolve(`.local/federation-test-${randomBytes(6).toString('hex')}.json`);
  writeFileSync(providerPath, JSON.stringify([{ id: 'mock', issuer, clientId: 'mock-client' }]), { flag: 'wx' });
  process.env.FEDERATION_PROVIDERS_PATH = providerPath;
  app = await createAuthApp();
  identity = services();
  const { adapterFactory } = require('../dist/oidc/persistence/postgres.adapter.js');
  await new (adapterFactory(identity.db, identity.vault))('Client').upsert(nativeClientId, { client_id: nativeClientId, client_name: 'Native test', application_type: 'native', redirect_uris: ['tala://oauth/callback'], post_logout_redirect_uris: ['tala://oauth/logout'], response_types: ['code'], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'none', scope: 'openid profile email offline_access tala.api tala.identity' }, 0);
  await identity.db.rateBucket.deleteMany({ where: { key: { in: ownedRateKeys } } });
  await app.listen(Number(process.env.AUTH_PORT), '127.0.0.1');
});
beforeEach(async () => {
  // Each case owns a fresh budget; actual limit tests use dedicated keys across processes.
  await identity.db.rateBucket.deleteMany({ where: { key: { in: ownedRateKeys } } });
});

after(async () => {
  for (const child of children) await stopInstance(child);
  if (identity) {
    await identity.db.rateBucket.deleteMany({ where: { key: { in: ownedRateKeys } } });
    if (userId) { await identity.revokeUser(userId); await identity.db.mail.deleteMany({ where: { userId } }); await identity.db.auditEvent.deleteMany({ where: { userId } }); await identity.db.user.deleteMany({ where: { id: userId } }); }
    await identity.db.oidcArtifact.deleteMany({ where: { model: 'Client', id: { in: ownedClients } } });
    externalUser = await identity.db.user.findUnique({ where: { email: externalEmail } });
    if (externalUser) { await identity.revokeUser(externalUser.id); await identity.db.auditEvent.deleteMany({ where: { userId: externalUser.id } }); await identity.db.user.delete({ where: { id: externalUser.id } }); }
  }
  if (app) await app.close();
  if (mock) { mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve)); }
  if (providerPath) unlinkSync(providerPath);
  if (testKeysPath) unlinkSync(testKeysPath);
});
test('Discovery, JWKS publics et en-têtes', async () => {
  const response = await fetch(`${base}/.well-known/openid-configuration`);
  const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.issuer, base); assert.deepEqual(data.code_challenge_methods_supported, ['S256']);
  const keys = await (await fetch(data.jwks_uri)).json(); assert.ok(keys.keys.length); assert.ok(keys.keys.every(k => !k.d));
  assert.ok(response.headers.get('content-security-policy')); assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('Swagger UI sert le schéma REST et ses ressources sans assouplir la CSP', async () => {
  const response = await fetch(`${base}/docs`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /swagger-ui-bundle\.js/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  for (const file of ['swagger-ui-bundle.js', 'swagger-ui-init.js', 'swagger-ui.css']) {
    const asset = await fetch(`${base}/docs/${file}`);
    assert.equal(asset.status, 200);
    if (file === 'swagger-ui-init.js') {
      const init = await asset.text();
      assert.match(init, /"persistAuthorization": false/);
      assert.match(init, /"validatorUrl": null/);
    }
  }
  const document = await (await fetch(`${base}/docs-json`)).json();
  const existing = await (await fetch(`${base}/openapi.json`)).json();
  assert.deepEqual(document, existing);
  assert.equal(document.components.securitySchemes.Bearer.scheme, 'bearer');
  assert.ok(document.paths['/account/register'].post.requestBody);
});

test('CSRF, inscription, vérification et lien à usage unique', async () => {
  const denied = await fetch(`${base}/account/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, username: 'ignored', password }) }); assert.equal(denied.status, 403);
  const browser = new Browser();
  assert.equal((await browser.post('/account/register', { email, username: email.split('@')[0], password })).status, 201);
  const user = await identity.db.user.findUnique({ where: { email } }); userId = user.id; assert.notEqual(user.passwordHash, password); assert.equal(user.emailVerified, false);
  const raw = await actionToken('verify');
  assert.equal((await browser.post('/account/email/confirm', { token: raw })).status, 201);
  assert.equal((await browser.post('/account/email/confirm', { token: raw })).status, 400);
});
test('PKCE et rejet des mauvais jetons', async () => {
  const invalid = await exchange(await authorization(), { code_verifier: randomBytes(32).toString('base64url') }); assert.equal(invalid.status, 400);
  const result = await login(); access = result.access_token; refresh = result.refresh_token; assert.ok(refresh);
  assert.equal((await account('/account/me', undefined, 'GET')).status, 200);
  assert.equal((await account('/account/me', undefined, 'GET', result.id_token)).status, 401);
  assert.equal((await account('/admin/users', undefined, 'GET')).status, 403);
  assert.equal((await account('/account/me', undefined, 'GET', access.slice(0, -8) + 'tampered')).status, 401);
  const jwks = JSON.parse(readFileSync(process.env.AUTH_JWKS_PATH, 'utf8'));
  const key = await importJWK(jwks.keys[0], 'RS256');
  for (const changes of [{ aud: 'urn:wrong' }, { iss: 'https://wrong.example' }, { exp: 1 }]) {
    const invalid = await new SignJWT({ ...decodeJwt(access), ...changes }).setProtectedHeader({ alg: 'RS256', kid: jwks.keys[0].kid, typ: 'at+jwt' }).sign(key);
    assert.equal((await account('/account/me', undefined, 'GET', invalid)).status, 401);
  }
});
test('Un seul échange concurrent du même code réussit', async () => {
  const flow = await authorization(); const results = await Promise.all([exchange(flow), exchange(flow)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
});

test('Client natif public : une connexion, deux ressources distinctes et refresh tournant', async () => {
  const flow = await authorization(undefined, false, { clientId: nativeClientId, redirectUri: 'tala://oauth/callback', scope: 'openid profile email offline_access tala.api tala.identity', omitResource: true });
  const exchanged = await exchange(flow, { client_id: nativeClientId, redirect_uri: 'tala://oauth/callback', resource: process.env.API_AUDIENCE });
  assert.equal(exchanged.status, 200); const api = await exchanged.json(); assert.equal(decodeJwt(api.access_token).aud, process.env.API_AUDIENCE);
  const renewed = await fetch(`${base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: nativeClientId, grant_type: 'refresh_token', refresh_token: api.refresh_token, resource: identityAudience }) });
  assert.equal(renewed.status, 200); const identityToken = await renewed.json(); assert.notEqual(identityToken.refresh_token, api.refresh_token); assert.equal(decodeJwt(identityToken.access_token).aud, identityAudience);
  assert.equal((await account('/account/me', undefined, 'GET', identityToken.access_token)).status, 200);
  const handoff = await account('/account/identities/mock/link', { password, browser: true }, 'POST', identityToken.access_token);
  assert.equal(handoff.status, 201);
  const { authorizationUrl } = await handoff.json();
  const browser = new Browser();
  const continued = await browser.request(authorizationUrl); assert.equal(continued.status, 302);
  assert.equal((await browser.request(authorizationUrl)).status, 400, 'Relais navigateur consommable une seule fois');
  const provider = await browser.request(continued.headers.get('location')); assert.equal(provider.status, 302);
  const completed = await browser.request(provider.headers.get('location')); assert.equal(completed.status, 302);
  assert.equal(completed.headers.get('location'), 'tala-app://account/linked');
  const linked = await account('/account/identities', undefined, 'GET', identityToken.access_token);
  assert.ok((await linked.json()).some(item => item.provider === 'mock'));
  assert.equal((await account('/account/identities/mock', { password }, 'DELETE', identityToken.access_token)).status, 200);
  const end = await flow.browser.request(`/session/end?${new URLSearchParams({ client_id: nativeClientId, id_token_hint: api.id_token, post_logout_redirect_uri: 'tala://oauth/logout' })}`);
  assert.equal(end.status, 200);
  assert.match(end.headers.get('content-security-policy'), /form-action 'self' tala:/);
  const logoutHtml = await end.text();
  const logoutAction = logoutHtml.match(/id="op.logoutForm" method="post" action="([^"]+)"/)?.[1];
  const xsrf = logoutHtml.match(/name="xsrf" value="([^"]+)"/)?.[1];
  assert.ok(logoutAction && xsrf);
  const loggedOut = await flow.browser.request(logoutAction, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base }, body: new URLSearchParams({ xsrf, logout: 'yes' }) });
  assert.equal(loggedOut.status, 303);
  assert.equal(loggedOut.headers.get('location'), 'tala://oauth/logout');
});

test('Parcours navigateur : erreurs lisibles et formulaires de récupération sans JSON', async () => {
  const browser = new Browser();
  const recoveryPage = await browser.request('/forgot-password'); assert.equal(recoveryPage.status, 200); assert.match(await recoveryPage.text(), /<form/);
  const response = await browser.request('/account/email/confirm', { method: 'POST', headers: { accept: 'text/html', origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ csrf: await browser.csrf(), token: randomBytes(32).toString('base64url') }) });
  assert.equal(response.status, 400); assert.match(response.headers.get('content-type'), /text\/html/); assert.match(await response.text(), /Vérifions ensemble/);
});
test('Rotation refresh et refus de la réutilisation', async () => {
  const result = await login();
  const renew = () => fetch(`${base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: reviewClientId, grant_type: 'refresh_token', refresh_token: result.refresh_token, resource: identityAudience }) });
  const first = await renew(); assert.equal(first.status, 200); assert.notEqual((await first.json()).refresh_token, result.refresh_token);
  assert.equal((await renew()).status, 400);
});

test('Deux processus partagent la consommation des codes, la rotation et les limites', async () => {
  const second = await startInstance();
  try {
    const flow = await authorization();
    const remoteExchange = () => fetch(`${second.base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: reviewClientId, redirect_uri: `${base}/review/callback`, grant_type: 'authorization_code', code: flow.code, code_verifier: flow.verifier, resource: identityAudience }) });
    const exchanged = await Promise.all([exchange(flow), remoteExchange()]);
    assert.deepEqual(exchanged.map(response => response.status).sort(), [200, 400]);
    const result = await login();
    const renew = url => fetch(`${url}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: reviewClientId, grant_type: 'refresh_token', refresh_token: result.refresh_token, resource: identityAudience }) });
    const rotated = await Promise.all([renew(base), renew(second.base)]);
    assert.deepEqual(rotated.map(response => response.status).sort(), [200, 400]);
    const successor = await rotated.find(response => response.ok).json();
    // Strict replay policy: a reused refresh token invalidates its grant on both instances.
    assert.equal((await account('/account/me', undefined, 'GET', successor.access_token)).status, 401);
    const key = `multiprocess:${randomBytes(12).toString('hex')}`;
    try {
      const limits = await Promise.all(Array.from({ length: 8 }, (_, index) => index % 2 ? remoteLimit(second.child, key) : identity.limit(key, 3).then(() => true, () => false)));
      assert.equal(limits.filter(Boolean).length, 3);
    } finally {
      await identity.db.rateBucket.deleteMany({ where: { key: createHash('sha256').update(`test:${key}`).digest('hex') } });
    }
  } finally { await stopInstance(second.child); }
});

test('Redémarrage complet et rotation conservent comptes, sessions et anciennes signatures', async () => {
  const previous = await login();
  const previousKid = JSON.parse(Buffer.from(previous.access_token.split('.')[0], 'base64url')).kid;
  const before = await identity.db.user.findUnique({ where: { id: userId } });
  execFileSync(process.execPath, ['scripts/rotate-keys.mjs'], { env: process.env, stdio: 'pipe' });
  await app.close();
  app = await createAuthApp(); identity = services();
  await app.listen(Number(process.env.AUTH_PORT), '127.0.0.1');
  assert.equal((await identity.db.user.findUnique({ where: { id: userId } })).passwordHash, before.passwordHash);
  assert.equal((await account('/account/me', undefined, 'GET', previous.access_token)).status, 200);
  const current = await login();
  const currentKid = JSON.parse(Buffer.from(current.access_token.split('.')[0], 'base64url')).kid;
  assert.notEqual(currentKid, previousKid);
  const keys = await (await fetch(`${base}/jwks`)).json();
  assert.ok(keys.keys.some(key => key.kid === previousKid));
  assert.ok(keys.keys.some(key => key.kid === currentKid));
  assert.ok(keys.keys.every(key => !key.d));
  const second = await startInstance();
  try {
    assert.equal((await fetch(`${second.base}/account/me`, { headers: { authorization: `Bearer ${previous.access_token}` } })).status, 200);
    assert.equal((await fetch(`${second.base}/account/me`, { headers: { authorization: `Bearer ${current.access_token}` } })).status, 200);
  } finally { await stopInstance(second.child); }
});

test('Refresh limité par inactivité et durée absolue, même après rotation', async () => {
  const result = await login();
  const rows = await identity.db.oidcArtifact.findMany({ where: { model: 'RefreshToken', accountId: userId } });
  const row = rows.find(row => identity.vault.open(row.payload).grantId === decodeJwt(result.access_token).gid && !row.consumedAt);
  assert.ok(row);
  const idle = Number(process.env.AUTH_REFRESH_IDLE_TTL || 604800);
  assert.ok(row.expiresAt.getTime() - Date.now() <= idle * 1000 + 1000);
  const payload = identity.vault.open(row.payload);
  payload.iiat = Math.floor(Date.now() / 1000) - Number(process.env.AUTH_REFRESH_ABSOLUTE_TTL || 1209600) - 1;
  await identity.db.oidcArtifact.update({ where: { model_id: { model: row.model, id: row.id } }, data: { payload: identity.vault.seal(payload) } });
  const response = await fetch(`${base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: reviewClientId, grant_type: 'refresh_token', refresh_token: result.refresh_token, resource: identityAudience }) });
  assert.equal(response.status, 400);
});
test('Profil, changement de mot de passe et autorisations d’un autre compte', async () => {
  access = (await login()).access_token;
  assert.equal((await account('/account/me', { username: `updated-${randomBytes(5).toString('hex')}` }, 'PATCH')).status, 200);
  assert.equal((await account('/account/grants/not-owned', undefined, 'DELETE')).status, 400);
  assert.equal((await account('/account/password/change', { currentPassword: 'incorrect', password: 'AutrePhrase!4567890' })).status, 401);
  const next = 'AutrePhrase!4567890';
  assert.equal((await account('/account/password/change', { currentPassword: password, password: next })).status, 201);
  password = next;
  assert.equal((await account('/account/me', undefined, 'GET')).status, 401);
});
test('MFA, codes de secours et administration réservée', async () => {
  access = (await login()).access_token;
  const prepared = await account('/account/mfa/enroll', { password }); assert.equal(prepared.status, 201); secret = (await prepared.json()).secret;
  const otp = new TOTP({ secret }).generate();
  const confirmed = await account('/account/mfa/confirm', { code: otp }); assert.equal(confirmed.status, 201); recovery = (await confirmed.json()).recoveryCodes; assert.equal(recovery.length, 10);
  assert.equal((await account('/account/me', undefined, 'GET')).status, 401);
  await identity.db.user.update({ where: { id: userId }, data: { role: 'admin' } });
  const nextOtp = new TOTP({ secret }).generate({ timestamp: Date.now() + 30000 });
  access = (await login(nextOtp)).access_token;
  assert.equal((await account('/admin/users', undefined, 'GET')).status, 200);
  const jwks = JSON.parse(readFileSync(process.env.AUTH_JWKS_PATH, 'utf8'));
  const key = await importJWK(jwks.keys[0], 'RS256');
  for (const changes of [{ scope: 'tala.identity' }, { client_id: 'untrusted-client' }, { auth_time: 1 }, { amr: ['pwd', 'recovery'] }]) {
    const denied = await new SignJWT({ ...decodeJwt(access), ...changes }).setProtectedHeader({ alg: 'RS256', kid: jwks.keys[0].kid, typ: 'at+jwt' }).sign(key);
    assert.equal((await account('/admin/users', undefined, 'GET', denied)).status, 403);
  }
  const wrongAudience = await new SignJWT({ ...decodeJwt(access), aud: process.env.API_AUDIENCE }).setProtectedHeader({ alg: 'RS256', kid: jwks.keys[0].kid, typ: 'at+jwt' }).sign(key);
  assert.equal((await account('/admin/users', undefined, 'GET', wrongAudience)).status, 401);
  assert.equal((await account('/admin/clients', { client_id: 'untrusted-admin-client', client_name: 'Denied', kind: 'public', redirect_uris: [`${base}/callback`], scope: 'openid tala.identity tala.admin' })).status, 400);
  const clientId = `e2e-${randomBytes(5).toString('hex')}`; ownedClients.push(clientId);
  const created = await account('/admin/clients', { client_id: clientId, client_name: 'Test service', kind: 'service', scope: 'tala.api' }); assert.equal(created.status, 201);
  const client = await created.json(); assert.ok(client.client_secret);
  const machine = await fetch(`${base}/token`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${clientId}:${client.client_secret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'tala.api', resource: process.env.API_AUDIENCE }) }); assert.equal(machine.status, 200);
  assert.equal((await account('/account/me', undefined, 'GET', (await machine.json()).access_token)).status, 401);
  const clients = await (await account('/admin/clients', undefined, 'GET')).json(); assert.ok(clients.every(c => !c.client_secret));
});
test('Codes de secours à usage unique et renouvellement', async () => {
  const renewed = await account('/account/mfa/recovery-codes', { password, code: recovery[0] }); assert.equal(renewed.status, 201);
  const previous = recovery[1]; recovery = (await renewed.json()).recoveryCodes;
  const user = await identity.db.user.findUnique({ where: { id: userId } });
  await assert.rejects(() => identity.checkMfa(user, previous));
  access = (await login(recovery[0])).access_token;
  assert.equal((await account('/admin/users', undefined, 'GET')).status, 403);
  await assert.rejects(() => identity.checkMfa(user, recovery[0]));
});
test('Révocation de session et récupération invalident les accès', async () => {
  const sessions = await (await account('/account/sessions', undefined, 'GET')).json(); assert.ok(sessions.length);
  assert.equal((await account(`/account/sessions/${sessions[0].id}`, undefined, 'DELETE')).status, 200);
  const browser = new Browser(); await browser.post('/account/password/request', { email });
  const raw = await actionToken('reset');
  const newPassword = 'UneNouvellePhrase!123456';
  assert.equal((await browser.post('/account/password/reset', { token: raw, password: newPassword })).status, 201);
  password = newPassword;
  assert.equal((await account('/account/me', undefined, 'GET')).status, 401);
  assert.equal((await browser.post('/account/password/reset', { token: raw, password: newPassword })).status, 400);
});
test('Fédération OIDC complète avec fournisseur local et état invalide rejeté', async () => {
  const invalid = await fetch(`${base}/federation/mock/callback?state=invalid&code=invalid`); assert.equal(invalid.status, 400);
  const response = await exchange(await authorization(undefined, true)); assert.equal(response.status, 200);
  const result = await response.json(); const profile = await account('/account/me', undefined, 'GET', result.access_token); assert.equal(profile.status, 200);
  assert.equal((await profile.json()).email, externalEmail);
  const second = await exchange(await authorization(undefined, true)); assert.equal(second.status, 200);
  assert.equal(decodeJwt((await second.json()).access_token).sub, decodeJwt(result.access_token).sub);
  const formPost = await exchange(await authorization(undefined, 'form_post')); assert.equal(formPost.status, 200);
  const federatedToken = result.access_token;
  assert.equal((await account('/account/identities/mock', {}, 'DELETE', federatedToken)).status, 400);
  assert.equal((await account('/account/password/change', { password: 'MotDePasseExterne!56789' }, 'POST', federatedToken)).status, 201);
});
test('Limite partagée atomique et chiffrement authentifié', async () => {
  const key = `test-${randomBytes(6).toString('hex')}`;
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => identity.limit(key, 3)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  await identity.db.rateBucket.delete({ where: { key: createHash('sha256').update(`test:${key}`).digest('hex') } });
  const encrypted = Buffer.from(identity.vault.seal({ value: 'sensitive-test' }), 'base64url'); encrypted[30] ^= 1;
  assert.throws(() => identity.vault.open(encrypted.toString('base64url')));
});
test('Export sans secrets, désactivation MFA et suppression du compte', async () => {
  access = (await login(recovery[1])).access_token;
  const exported = await account('/account/export', undefined, 'GET'); assert.equal(exported.status, 200);
  const profile = (await exported.json()).profile; assert.ok(!('passwordHash' in profile)); assert.ok(!('mfaSecret' in profile));
  assert.equal((await account('/account/mfa/disable', { password, code: recovery[2] })).status, 400);
  // The fixture leaves its administrative role before exercising ordinary-user disable.
  await identity.db.user.update({ where: { id: userId }, data: { role: 'viewer' } });
  assert.equal((await account('/account/mfa/disable', { password, code: recovery[2] })).status, 201);
  access = (await login()).access_token;
  assert.equal((await account('/account/me', { password }, 'DELETE')).status, 200);
  assert.equal((await account('/account/me', undefined, 'GET')).status, 401);
  assert.equal(await identity.db.user.findUnique({ where: { id: userId } }), null);
});
