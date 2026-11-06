import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, rmdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { fork, spawn, execFileSync } from 'node:child_process';
import { randomBytes, generateKeyPairSync, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import assert from 'node:assert/strict';
import { feedFlow } from './feed-flow.mjs';
import { testDatabase } from '../../scripts/test-database.mjs';
const require = createRequire(import.meta.url);
const { parse } = createRequire(resolve('../authserver/package.json'))('dotenv');
const { Database: AuthDatabase } = require('../../authserver/dist/database/database.service.js');
const { Vault } = require('../../authserver/dist/security/crypto.js');
const { adapterFactory } = require('../../authserver/dist/oidc/persistence/postgres.adapter.js');
const { Pool } = require('pg');
const { TOTP } = createRequire(resolve('../authserver/package.json'))('otpauth');
const root = resolve('..'), authEnv = parse(readFileSync('../authserver/.env')), apiEnv = parse(readFileSync('../api/.env'));
const executable = resolve('../authserver/.local/node24/node-v24.22.1-win-x64/node.exe');
const fixture = `clients-${randomBytes(6).toString('hex')}`, email = `${fixture}@example.test`, password = 'PhraseClients!4567890';
const key = randomBytes(32), sealKey = Buffer.from(authEnv.AUTH_ENCRYPTION_KEY, 'hex');
const authVault = new Vault(sealKey.toString('hex'));
const children = new Set(); const ids = new Set();
let browser, web, apiService, authDb, business, userId, privateFile, mediaRoot, sourceFile, testIssuer, isolatedDatabase, isolatedAuthDatabase;
const hash = value => createHash('sha256').update(value).digest('hex');
async function freePort() { const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
async function start(target, env) {
  const child = fork(resolve('../scripts/client-test-service.mjs'), [target], { cwd: root, execPath: executable, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }); children.add(child);
  let errors = ''; child.stderr.on('data', data => { errors += data.toString(); });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`${target} non disponible`)), 30000); child.once('message', () => { clearTimeout(timer); resolve(); }); child.once('exit', code => { clearTimeout(timer); reject(new Error(`${target} : arrêt ${code}, ${errors.slice(0, 300)}`)); }); });
  return child;
}
async function stop(child) { if (!child || child.exitCode !== null) return; await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 10000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.send('stop'); }); children.delete(child); }
function decrypt(payload) { const data = Buffer.from(payload, 'base64url'), cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12)); cipher.setAuthTag(data.subarray(12, 28)); return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString()); }
function encrypt(value) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv), data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url'); }
async function remember(context) { for (const cookie of await context.cookies()) if (['tala_session', 'tala_flow'].includes(cookie.name)) ids.add(hash(cookie.value)); }
async function submitLogin(page, origin, code, currentPassword = password) {
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Mot de passe', { exact: true }).fill(currentPassword); if (code) await page.getByLabel('Code MFA ou code de secours, si activé').fill(typeof code === 'function' ? code() : code); await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  const consent = page.getByRole('button', { name: 'Autoriser', exact: true });
  await Promise.race([consent.waitFor({ state: 'visible' }), page.waitForURL(origin + '/compte')]);
  if (await consent.isVisible()) await consent.click({timeout:60000});
  await page.waitForURL(origin + '/compte',{timeout:60000});
}
try {
  const authPort = await freePort(), apiPort = await freePort(), webPort = await freePort();
  const issuer = `http://127.0.0.1:${authPort}`, origin = `http://127.0.0.1:${webPort}`, apiOrigin = `http://127.0.0.1:${apiPort}`;
  testIssuer=issuer;
  isolatedDatabase=await testDatabase(apiEnv,executable);
  isolatedAuthDatabase=await testDatabase(authEnv,executable,'authserver');
  business=new Pool({connectionString:isolatedDatabase.url});
  await business.query('CREATE SCHEMA tala_web');
  await business.query('CREATE TABLE tala_web.sessions (id text PRIMARY KEY, kind text NOT NULL, payload text NOT NULL, expires_at timestamptz NOT NULL)');
  await business.query('CREATE INDEX web_sessions_expiry ON tala_web.sessions (expires_at)');
  mkdirSync('.local', { recursive: true }); privateFile = resolve(`.local/${fixture}.json`);
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(privateFile, JSON.stringify({ keys: [{ ...pair.privateKey.export({ format: 'jwk' }), kid: fixture, alg: 'RS256', use: 'sig' }] }), { mode: 0o600 });
  const clientId = `${fixture}-web`, secret = randomBytes(32).toString('base64url'), review = `${fixture}-review`;
  const env = { ...process.env, ...authEnv, AUTH_DATABASE_URL: isolatedAuthDatabase.url, NODE_ENV: 'test', OIDC_ISSUER: issuer, AUTH_WEB_ORIGIN: origin, AUTH_PORT: String(authPort), AUTH_JWKS_PATH: privateFile, AUTH_REVIEW_CLIENT_ID: review, AUTH_APPLICATION_CLIENT_IDS: clientId, AUTH_ADMIN_CLIENT_IDS: review, SMTP_URL: '', FEDERATION_PROVIDERS_PATH: '' };
  process.env.AUTH_DATABASE_URL = isolatedAuthDatabase.url;
  authDb = new AuthDatabase();
  const adapter = new (adapterFactory(authDb, authVault))('Client');
  await adapter.upsert(clientId, { client_id: clientId, client_name: 'TALA test web', client_secret: secret, redirect_uris: [`${origin}/auth/callback`], post_logout_redirect_uris: [origin + '/'], response_types: ['code'], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'client_secret_basic', scope: 'openid profile email offline_access tala.api tala.identity' }, 0);
  await start('auth', env);
  mediaRoot=resolve('.local/'+fixture+'-media');
  const apiEnvironment = { ...process.env, ...apiEnv, DATABASE_URL:isolatedDatabase.url, NODE_ENV: 'test', API_PORT: String(apiPort), OIDC_ISSUER: issuer, MEDIA_ENABLED:'true', MEDIA_DRIVER:'local', MEDIA_QUEUE_DRIVER:'postgres',MEDIA_ROOT:mediaRoot,MEDIA_ORIGIN:apiOrigin,MEDIA_WORKER_ISSUER:issuer };
  apiService = await start('api', apiEnvironment);
  await start('media',apiEnvironment);
  const webEnv = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', ALLOW_LOCAL_HTTP: 'true', WEB_ORIGIN: origin, OIDC_ISSUER: issuer, API_ORIGIN: apiOrigin, OIDC_CLIENT_ID: clientId, OIDC_CLIENT_SECRET: secret, WEB_DATABASE_URL: isolatedDatabase.url, WEB_SESSION_KEY: key.toString('hex'), API_AUDIENCE: 'urn:tala:api', IDENTITY_AUDIENCE: 'urn:tala:identity' };
  web = spawn(executable, ['node_modules/next/dist/bin/next', 'start', '-p', String(webPort), '-H', '127.0.0.1'], { cwd: resolve('.'), env: webEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let index = 0; index < 60; index++) { try { if ((await fetch(origin)).ok) break; } catch {} if (index === 59) throw new Error('Web non disponible'); await new Promise(resolve => setTimeout(resolve, 500)); }
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
  page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(60000);
  const browserErrors = []; page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /Content Security Policy|content security policy/.test(message.text())) browserErrors.push(message.text().replace(/https?:\/\/[^\s'"<>]+/g, value=>{try{return new URL(value).origin;}catch{return '[URL]';}})); });
  await page.goto(origin); await expect(page.getByRole('link', { name: 'Créer un compte', exact: true })).toBeVisible();
  const csp = (await context.request.get(origin)).headers()['content-security-policy']; assert.ok(csp.includes("'nonce-")); assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"));
  await page.getByRole('link', { name: 'Créer un compte', exact: true }).click(); await page.waitForURL(issuer + '/register'); await remember(context);
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Pseudonyme', { exact: true }).fill(fixture); await page.getByLabel(/Mot de passe/).fill(password);
  await page.getByRole('button', { name: 'Créer le compte' }).click(); await expect(page.getByRole('heading', { name: 'C’est fait' })).toBeVisible();
  const user = await authDb.user.findUnique({ where: { email } }); assert.ok(user); userId = user.id;
  await authDb.user.update({ where: { id: userId }, data: { role: 'creator' } });
  const mail = await authDb.mail.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }); const verification = authVault.open(mail.content).text;
  await page.goto(verification); await page.getByRole('button', { name: 'Vérifier mon adresse' }).click();
  await page.getByRole('link', { name: 'Revenir à la connexion' }).click(); await submitLogin(page, origin); await remember(context);
  await expect(page.getByRole('heading', { name: 'Présentez-vous' })).toBeVisible();
  await page.getByLabel('Nom affiché', { exact: true }).fill('Nadia de TALA'); await page.getByLabel('Pseudonyme', { exact: true }).fill(fixture.replaceAll('-', '_'));
  await page.getByLabel('Biographie', { exact: true }).fill('Des histoires, de la musique et des idées.'); await page.getByLabel('Pays (code à deux lettres)', { exact: true }).fill('CD');
  await page.getByLabel('Langues, séparées par des virgules').fill('fr, ln-CD'); await page.getByLabel('Profil privé', { exact: false }).check();
  await page.getByRole('button', { name: 'Créer mon profil' }).click(); await expect(page.getByRole('heading', { name: 'Votre profil', exact: true })).toBeVisible();
  const current = await context.request.get(origin + '/api/session'); const sessionView = await current.json(); assert.equal(sessionView.profile.isPrivate, true); assert.ok(!JSON.stringify(sessionView).includes('refresh_token'));
  const sid = (await context.cookies()).find(cookie => cookie.name === 'tala_session'); assert.ok(sid.httpOnly); ids.add(hash(sid.value));
  const denied = await context.request.patch(origin + '/api/profile', { headers: { Origin: 'https://other.example', 'x-csrf-token': sessionView.csrf }, data: { bio: 'Intrusion' } }); assert.equal(denied.status(), 403);
  const row = (await business.query('SELECT payload FROM tala_web.sessions WHERE id=$1', [hash(sid.value)])).rows[0]; const session = decrypt(row.payload);
  for (const token of Object.values(session.tokens)) token.expires = 0;
  await business.query('UPDATE tala_web.sessions SET payload=$1 WHERE id=$2', [encrypt(session), hash(sid.value)]);
  const simultaneous = await Promise.all(Array.from({ length: 6 }, () => context.request.get(origin + '/api/session'))); assert.ok(simultaneous.every(response => response.ok()),'Sessions concurrentes : '+simultaneous.map(r=>r.status()).join(','));
  await stop(apiService);
  const latestRow = (await business.query('SELECT payload FROM tala_web.sessions WHERE id=$1', [hash(sid.value)])).rows[0], latest = decrypt(latestRow.payload); latest.tokens['urn:tala:api'].expires = 0;
  await business.query('UPDATE tala_web.sessions SET payload=$1 WHERE id=$2', [encrypt(latest), hash(sid.value)]);
  assert.equal((await context.request.get(origin + '/api/profile')).status(), 503);
  apiService = await start('api', apiEnvironment); assert.equal((await context.request.get(origin + '/api/profile')).status(), 200);
  sourceFile=resolve('.local/'+fixture+'.mp4');
  execFileSync(apiEnv.FFMPEG_PATH,['-nostdin','-v','error','-y','-f','lavfi','-i','testsrc2=size=160x284:rate=24','-t','2','-c:v','libx264','-threads','2','-crf','0','-pix_fmt','yuv420p',sourceFile],{stdio:'pipe'});
  await page.getByRole('button',{name:'Mes vidéos',exact:true}).click();
  await page.getByLabel('Titre',{exact:true}).fill('Première histoire TALA');
  await page.getByLabel('Fichier vidéo',{exact:true}).setInputFiles(sourceFile);
  await page.getByRole('button',{name:'Envoyer la vidéo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Publier la vidéo',exact:true})).toBeVisible({timeout:60000});
  await page.getByRole('button',{name:'Voir la vidéo',exact:true}).click();
  await expect(page.locator('video')).toBeVisible();await expect.poll(()=>page.locator('video').evaluate(video=>video.readyState),{timeout:20000}).toBeGreaterThanOrEqual(2);
  assert.equal(await page.locator('video').evaluate(video=>Math.round(video.duration)),2);
  await page.locator('video').evaluate(video=>video.play());await expect.poll(()=>page.locator('video').evaluate(video=>video.currentTime)).toBeGreaterThan(0.25);await page.locator('video').evaluate(video=>video.pause());
  await page.getByRole('button',{name:'Publier la vidéo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retirer de la publication',exact:true})).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.local/web-video-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.local/web-video-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});
  await feedFlow({page,context,origin,business,mediaRoot,fixture});
  console.log('E2E : import, fil, lecture, sous-titres, interactions et historique validés.');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Supprimer la vidéo',exact:true}).click();
  await expect(page.getByText('Vous n’avez pas encore importé de vidéo.',{exact:true})).toBeVisible();
  await page.getByRole('button', { name: 'Compte et sécurité', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Votre compte', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sessions ouvertes' })).toBeVisible();
  await expect(page.getByText('Cette connexion', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.local/web-account-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'Mon profil', exact: true }).click(); await page.screenshot({ path: '.local/web-profile-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.goto(`${origin}/profil/${fixture.replaceAll('-', '_')}`); await expect(page.getByText(/Ce profil est privé/)).toBeVisible(); await expect(page.getByText('Des histoires, de la musique et des idées.')).toHaveCount(0);
  await page.goto(origin + '/compte'); await expect(page.getByRole('heading', { name: 'Votre profil', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await page.waitForURL(issuer + '/session/end**'); const confirm = page.getByRole('button', { name: 'Confirmer la déconnexion' }); if (await confirm.isVisible()) await confirm.click(); await page.waitForURL(origin + '/');
  await page.goto(origin + '/auth/login'); await submitLogin(page, origin); await remember(context);
  await page.getByRole('button', { name: 'Compte et sécurité', exact: true }).click();
  const mfa = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Double vérification', exact: true }) });
  await mfa.getByLabel('Mot de passe actuel, si vous en avez un').fill(password);
  await mfa.getByRole('button', { name: 'Préparer la double vérification' }).click();
  await expect(page.locator('.setup-secret')).toBeVisible();
  const totp = new TOTP({ secret: await page.locator('.setup-secret').innerText() });
  await mfa.getByLabel('Code de vérification ou code de secours').fill(totp.generate());
  await mfa.getByRole('button', { name: 'Activer la double vérification' }).click();
  await expect(page.getByRole('heading', { name: 'Votre double vérification est activée' })).toBeVisible();
  const codes = await page.locator('.recovery-codes code').allTextContents(); assert.equal(codes.length, 10);
  await page.getByRole('link', { name: 'J’ai conservé mes codes, me reconnecter' }).click(); await submitLogin(page, origin, codes[0]); await remember(context);
  await page.getByRole('button', { name: 'Compte et sécurité', exact: true }).click();
  const change = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Mot de passe', exact: true }) });
  const nextPassword = 'NouvellePhraseClients!4567890';
  await change.getByLabel('Mot de passe actuel, si vous en avez un').fill(password); await change.getByLabel('Nouveau mot de passe').fill(nextPassword);
  await change.getByRole('button', { name: 'Enregistrer le nouveau mot de passe' }).click();
  await expect(page.getByRole('heading', { name: 'Votre mot de passe a été changé' })).toBeVisible();
  await page.getByRole('link', { name: 'Me reconnecter', exact: true }).click();
  await page.getByRole('link', { name: 'Mot de passe oublié', exact: true }).click(); await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button').click(); await expect(page.getByRole('heading', { name: 'C’est fait' })).toBeVisible();
  const resetMail = await authDb.mail.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  await page.goto(authVault.open(resetMail.content).text); await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(password);
  await page.getByRole('button').click(); await page.getByRole('link', { name: 'Revenir à la connexion' }).click();
  await submitLogin(page, origin, codes[1]); await remember(context);
  await page.getByRole('button', { name: 'Compte et sécurité', exact: true }).click();
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Télécharger mes données' }).click(); const download = await downloading;
  const exported = readFileSync(await download.path(), 'utf8'); assert.ok(exported.includes(email)); assert.ok(!/passwordHash|refresh_token|mfaSecret/.test(exported));
  // Account erasure requires a recent OTP-authenticated session. Recovery-code
  // login above verifies recovery; use the authenticator for this sensitive step.
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await page.waitForURL(issuer + '/session/end**');
  const endSession = page.getByRole('button', { name: 'Confirmer la déconnexion' });
  if (await endSession.isVisible()) await endSession.click();
  await page.waitForURL(origin + '/');
  // Enrollment consumed that period's OTP; do not reuse it on a fast test run.
  const lastOtpCounter = Number((await authDb.user.findUnique({where:{id:userId}})).mfaCounter);
  await expect.poll(() => Math.floor(Date.now()/30000), {timeout:35000}).toBeGreaterThan(lastOtpCounter);
  await page.goto(origin + '/auth/login'); await submitLogin(page, origin, () => totp.generate()); await remember(context);
  await page.getByRole('button', { name: 'Compte et sécurité', exact: true }).click();
  const close = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Fermer mon compte', exact: true }) });
  await close.getByLabel('Mot de passe actuel, si vous en avez un').fill(password); page.once('dialog', dialog => dialog.accept());
  await close.getByRole('button', { name: 'Supprimer mon compte et mon profil' }).click(); await page.waitForURL(origin + '/?compte=supprime');
  assert.equal(await authDb.user.findUnique({ where: { id: userId } }), null);
  assert.equal((await business.query('SELECT id FROM "Profile" WHERE subject=$1', [userId])).rowCount, 0);
  assert.deepEqual(browserErrors, []);
  console.log('E2E web réussi : identité, profil privé, CSRF et refresh, import vidéo, worker FFmpeg séparé, lecture réelle, publication/suppression, responsive, MFA, récupération, export et fermeture du compte.');
} catch (error) {
  console.error('Échec du parcours navigateur :',error.message);
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) { await page.screenshot({ path: '.local/web-e2e-failure.png', fullPage: true }).catch(() => {}); console.error('Écran du test en échec :', await page.locator('h1').allTextContents().catch(() => [])); }
  throw error;
} finally {
  if (authDb && !userId) userId = (await authDb.user.findUnique({ where: { email } }))?.id;
  if (browser) await browser.close(); if (web) web.kill(); for (const child of [...children]) await stop(child);
  if (business) { if (userId) {
    const videos=(await business.query('SELECT id FROM "Video" WHERE "issuer"=$1',[testIssuer])).rows;
    if(mediaRoot)for(const {id}of videos){if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Fixture vidéo inattendue');for(const file of ['source.bin','prepared.mp4','candidate.mp4','poster.jpg','poster.tmp.jpg'])try{unlinkSync(resolve(mediaRoot,id,file));}catch(error){if(error.code!=='ENOENT')throw error;}try{rmdirSync(resolve(mediaRoot,id));}catch(error){if(error.code!=='ENOENT')throw error;}}
    await business.query('DELETE FROM "Video" WHERE "issuer"=$1',[testIssuer]);await business.query('DELETE FROM "Profile" WHERE "issuer"=$1', [testIssuer]);
  } if (ids.size) await business.query('DELETE FROM tala_web.sessions WHERE id = ANY($1::text[])', [[...ids]]); await business.end(); }
  if (authDb) { if (userId) { await authDb.oidcArtifact.deleteMany({ where: { accountId: userId } }); await authDb.mail.deleteMany({ where: { userId } }); await authDb.auditEvent.deleteMany({ where: { userId } }); await authDb.user.deleteMany({ where: { id: userId } }); } await authDb.oidcArtifact.deleteMany({ where: { model: 'Client', id: { in: [`${fixture}-web`, `${fixture}-review`] } } }); await authDb.$disconnect(); }
  if (privateFile) unlinkSync(privateFile);
  if(sourceFile)unlinkSync(sourceFile);if(mediaRoot)try{for(const entry of readdirSync(mediaRoot,{withFileTypes:true})){if(!entry.isDirectory()||!/^[a-f0-9-]{36}$/i.test(entry.name))throw new Error('Dossier fixture inattendu.');for(const file of ['source.bin','prepared.mp4','candidate.mp4','poster.jpg','poster.tmp.jpg'])try{unlinkSync(resolve(mediaRoot,entry.name,file));}catch(error){if(error.code!=='ENOENT')throw error;}rmdirSync(resolve(mediaRoot,entry.name));}rmdirSync(mediaRoot);}catch(error){if(error.code!=='ENOENT')throw error;}
  await isolatedDatabase?.dispose();
  await isolatedAuthDatabase?.dispose();
}
