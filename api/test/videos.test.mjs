import 'dotenv/config';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  unlinkSync,
  rmdirSync,
  readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
const require = createRequire(import.meta.url);
const { createApiApp } = require('../dist/app.factory.js');
const { Database } = require('../dist/database/database.service.js');
const { VideoConfig } = require('../dist/videos/video-config.service.js');
const { PrivateStorage } = require('../dist/videos/private-storage.service.js');
const { MediaQueue } = require('../dist/videos/media-queue.service.js');
const { MediaProcess } = require('../dist/videos/media-process.service.js');
const { MediaWorker } = require('../dist/videos/media-worker.service.js');
const { MuxService } = require('../dist/videos/mux.service.js');
if (
  process.env.NODE_ENV === 'production' ||
  !['localhost', '127.0.0.1'].includes(
    new URL(process.env.DATABASE_URL).hostname,
  )
)
  throw new Error('Tests vidéo réservés à PostgreSQL local.');
const fixture = 'video-test-' + randomBytes(6).toString('hex');
let app,
  db,
  jwks,
  base,
  issuer,
  tokenA,
  tokenB,
  worker,
  storage,
  mux,
  videoId,
  source,
  root;
const rateKeys = ['read', 'write', 'upload'].map((k) =>
  createHash('sha256').update(`test:${k}:127.0.0.1`).digest('hex'),
);
async function api(path, method = 'GET', body, token = tokenA, extra = {}) {
  return fetch(base + path, {
    method,
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined
        ? {
            'content-type': Buffer.isBuffer(body)
              ? 'application/octet-stream'
              : 'application/json',
          }
        : {}),
      ...extra,
    },
    body:
      body === undefined
        ? undefined
        : Buffer.isBuffer(body)
          ? body
          : JSON.stringify(body),
  });
}
async function reserve(extra = {}) {
  const response = await api('/videos', 'POST', {
    title: 'Une histoire TALA',
    size: source.length,
    kind: 'short',
    ...extra,
  });
  assert.equal(response.status, 201);
  return response.json();
}
before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.MEDIA_ENABLED = 'true';
  process.env.MEDIA_DRIVER = 'local';
  process.env.MEDIA_QUEUE_DRIVER = 'postgres';
  process.env.MUX_WEBHOOK_SECRET = randomBytes(32).toString('hex');
  root = resolve('.local/' + fixture);
  mkdirSync(root, { recursive: true });
  process.env.MEDIA_ROOT = root;
  execFileSync(
    process.env.FFMPEG_PATH,
    [
      '-nostdin',
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=160x284:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=44100',
      '-t',
      '2',
      '-c:v',
      'libx264',
      '-crf',
      '0',
      '-threads',
      '2',
      '-c:a',
      'aac',
      root + '/fixture.mp4',
    ],
    { stdio: 'pipe' },
  );
  source = readFileSync(root + '/fixture.mp4');
  execFileSync(
    process.env.FFMPEG_PATH,
    [
      '-nostdin',
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=160x90:rate=1',
      '-t',
      '181',
      '-c:v',
      'libx264',
      '-threads',
      '2',
      '-preset',
      'ultrafast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      root + '/fixture-long.mp4',
    ],
    { stdio: 'pipe' },
  );
  const pair = await generateKeyPair('RS256'),
    jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: fixture,
      alg: 'RS256',
      use: 'sig',
    };
  jwks = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((r) => jwks.listen(0, '127.0.0.1', r));
  issuer = process.env.OIDC_ISSUER = `http://127.0.0.1:${jwks.address().port}`;
  const token = (subject) =>
    new SignJWT({
      client_id: fixture,
      role: 'creator',
      scope: 'tala.api',
      sid: fixture,
      gid: fixture,
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: fixture })
      .setIssuer(issuer)
      .setSubject(subject)
      .setAudience(process.env.API_AUDIENCE || 'urn:tala:api')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(pair.privateKey);
  tokenA = await token(fixture + '-a');
  tokenB = await token(fixture + '-b');
  app = await createApiApp();
  await app.listen(0, '127.0.0.1');
  base = (await app.getUrl()) + '/api/v1';
  db = app.get(Database);
  storage = app.get(PrivateStorage);
  mux = app.get(MuxService);
  const config = app.get(VideoConfig);
  config.value.MEDIA_ORIGIN = await app.getUrl();
  worker = new MediaWorker(
    db,
    config,
    storage,
    new MediaProcess(config, storage),
    mux,
    app.get(MediaQueue),
  );
  await db.profile.create({
    data: {
      issuer,
      subject: fixture + '-a',
      username: fixture.replaceAll('-', '_'),
      displayName: 'Test vidéos',
    },
  });
});
beforeEach(async () => {
  await db.rateBucket.deleteMany({ where: { key: { in: rateKeys } } });
});
after(async () => {
  await worker?.onModuleDestroy();
  if (db) {
    const videos = await db.video.findMany({ where: { issuer } });
    for (const v of videos) await storage.removeFiles(v.id).catch(() => {});
    await db.video.deleteMany({ where: { issuer } });
    await db.profile.deleteMany({ where: { issuer } });
    await db.videoWebhook.deleteMany({
      where: { id: { startsWith: fixture } },
    });
    await db.rateBucket.deleteMany({ where: { key: { in: rateKeys } } });
  }
  await app?.close();
  if (jwks) {
    jwks.closeAllConnections();
    await new Promise((r) => jwks.close(r));
  }
  if (root) {
    for (const file of ['fixture.mp4', 'fixture-long.mp4','fixture-overlay.png'])
      try {
        unlinkSync(root + '/' + file);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    if (readdirSync(root).length === 0) rmdirSync(root);
  }
});
test('Import : authentification, profil, taille et propriétaire obligatoires', async () => {
  assert.equal(
    (await api('/videos', 'POST', { title: 'Intrusion', size: 1 }, null))
      .status,
    401,
  );
  assert.equal(
    (await api('/videos', 'POST', { title: 'Sans profil', size: 1 }, tokenB))
      .status,
    400,
  );
  assert.equal(
    (await api('/videos', 'POST', { title: 'Trop grand', size: 1073741824 }))
      .status,
    400,
  );
  assert.equal(
    (
      await api('/videos', 'POST', {
        title: 'Identité forgée',
        size: 1,
        subject: 'autre',
      })
    ).status,
    400,
  );
  const v = await reserve();
  videoId = v.id;
  assert.equal(v.visibility, 'private');
  assert.ok(!JSON.stringify(v).includes('subject'));
  assert.equal(
    (await api('/videos/' + videoId, 'GET', undefined, tokenB)).status,
    404,
  );
  assert.equal(
    (
      await api(`/videos/${videoId}/content`, 'PUT', Buffer.from('x'), tokenB, {
        'upload-offset': '0',
      })
    ).status,
    404,
  );
});
test('Import reprenable : blocs bornés, offset et fichier complet', async () => {
  const split = Math.floor(source.length / 2);
  assert.equal(
    (
      await api(
        `/videos/${videoId}/content`,
        'PUT',
        source.subarray(0, split),
        tokenA,
        { 'upload-offset': '1' },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        `/videos/${videoId}/content`,
        'PUT',
        source.subarray(0, split),
        tokenA,
        { 'upload-offset': '0' },
      )
    ).status,
    200,
  );
  assert.equal((await api(`/videos/${videoId}/complete`, 'POST')).status, 400);
  const state = await (await api('/videos/' + videoId)).json();
  assert.equal(state.uploadedBytes, split);
  assert.equal(
    (
      await api(
        `/videos/${videoId}/content`,
        'PUT',
        source.subarray(split),
        tokenA,
        { 'upload-offset': String(split) },
      )
    ).status,
    200,
  );
  assert.equal((await api(`/videos/${videoId}/complete`, 'POST')).status, 201);
  assert.equal((await api(`/videos/${videoId}/publish`, 'POST')).status, 409);
});
test('FFmpeg réel : un seul worker, contrôle qualité et miniature', async () => {
  await Promise.all([worker.process(videoId), worker.process(videoId)]);
  const v = await db.video.findUniqueOrThrow({ where: { id: videoId } });
  assert.equal(v.status, 'ready', v.errorCode || '');
  assert.ok(v.qualityScore >= 0.985);
  assert.ok(v.sourceHash);
  assert.equal(v.width, 160);
  assert.equal(v.height, 284);
  assert.ok((await storage.size(v.id, 'poster.jpg')) > 0);
  assert.equal(
    (await api(`/videos/${videoId}/playback`, 'GET', undefined, null)).status,
    404,
  );
});
test('Montage : découpe, vitesse et retrait du son sont appliqués au fichier final', async () => {
  const v=await reserve({editRecipe:{start:0.25,end:1.75,speed:2,muted:true}});
  assert.equal((await api(`/videos/${v.id}/content`,'PUT',source,tokenA,{'upload-offset':'0'})).status,200);
  assert.equal((await api(`/videos/${v.id}/complete`,'POST')).status,201);
  await worker.process(v.id);
  const result=await db.video.findUniqueOrThrow({where:{id:v.id}});
  assert.equal(result.status,'ready',result.errorCode||'');
  assert.ok(Math.abs(result.duration-0.75)<0.1);
  assert.ok(result.qualityScore>=0.985);
  assert.equal(result.optimization,'edit-h264-crf14-ssim-v1');
  const probe=JSON.parse(execFileSync(process.env.FFPROBE_PATH,['-v','error','-show_streams','-show_format','-of','json',await storage.path(v.id,'prepared.mp4')],{encoding:'utf8'}));
  assert.ok(Math.abs(Number(probe.format.duration)-0.75)<0.15);
  assert.equal(probe.streams.filter(s=>s.codec_type==='audio').length,0);
  assert.equal((await api('/videos/'+v.id,'PATCH',{editRecipe:{start:0,end:1}})).status,400);
});
test('Montage : ralentissement audio/vidéo et refus d’une fenêtre hors source', async () => {
  const v=await reserve({editRecipe:{start:0.5,end:1.5,speed:0.5,muted:false}});
  await api(`/videos/${v.id}/content`,'PUT',source,tokenA,{'upload-offset':'0'});
  await api(`/videos/${v.id}/complete`,'POST');await worker.process(v.id);
  const result=await db.video.findUniqueOrThrow({where:{id:v.id}});
  assert.equal(result.status,'ready',result.errorCode||'');
  const probe=JSON.parse(execFileSync(process.env.FFPROBE_PATH,['-v','error','-show_streams','-show_format','-of','json',await storage.path(v.id,'prepared.mp4')],{encoding:'utf8'}));
  assert.ok(Math.abs(Number(probe.format.duration)-2)<0.15);
  assert.equal(probe.streams.filter(s=>s.codec_type==='audio').length,1);
  const bad=await reserve({editRecipe:{start:0,end:900,speed:1}});
  await api(`/videos/${bad.id}/content`,'PUT',source,tokenA,{'upload-offset':'0'});
  await api(`/videos/${bad.id}/complete`,'POST');await worker.process(bad.id);
  const rejected=await db.video.findUniqueOrThrow({where:{id:bad.id}});
  assert.equal(rejected.status,'rejected');assert.equal(rejected.errorCode,'MEDIA_EDIT_RANGE');
});
test('Montage : recettes invalides refusées avant tout import', async () => {
  for(const editRecipe of [{start:2,end:1},{start:-1},{speed:100},{start:0,end:0.1},{speed:'2;rm'},{filter:'movie=http://localhost'}]){
    assert.equal((await api('/videos','POST',{title:'Montage invalide',size:source.length,editRecipe})).status,400);
  }
});
test('Calque privé : propriétaire, PNG borné, envoi obligatoire et rendu réellement intégré',async()=>{
 const v=await reserve({editRecipe:{overlay:true}});
 await api(`/videos/${v.id}/content`,'PUT',source,tokenA,{'upload-offset':'0'});
 assert.equal((await api(`/videos/${v.id}/complete`,'POST')).status,400);
 execFileSync(process.env.FFMPEG_PATH,['-nostdin','-v','error','-y','-f','lavfi','-i','color=c=0xff00ff:s=160x284,format=rgba','-frames:v','1',root+'/fixture-overlay.png'],{stdio:'pipe'});
 const png=readFileSync(root+'/fixture-overlay.png');
 assert.equal((await api(`/videos/${v.id}/overlay`,'PUT',png,tokenB,{'content-type':'image/png'})).status,404);
 assert.equal((await api(`/videos/${v.id}/overlay`,'PUT',Buffer.from('invalid'),tokenA,{'content-type':'image/png'})).status,400);
 const huge=Buffer.from(png);huge.writeUInt32BE(9000,16);
 assert.equal((await api(`/videos/${v.id}/overlay`,'PUT',huge,tokenA,{'content-type':'image/png'})).status,400);
 assert.equal((await api(`/videos/${v.id}/overlay`,'PUT',png,tokenA,{'content-type':'image/png'})).status,200);
 assert.equal((await api(`/videos/${v.id}/complete`,'POST')).status,201);
 assert.equal((await api(`/videos/${v.id}/overlay`,'PUT',png,tokenA,{'content-type':'image/png'})).status,409);
 await worker.process(v.id);const video=await db.video.findUniqueOrThrow({where:{id:v.id}});
 assert.equal(video.status,'ready',video.errorCode||'');assert.ok(video.qualityScore>=.985);
 const pixels=execFileSync(process.env.FFMPEG_PATH,['-v','error','-i',await storage.path(v.id,'prepared.mp4'),'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-'],{stdio:['ignore','pipe','pipe']});
 assert.ok(pixels[0]>230&&pixels[1]<20&&pixels[2]>230,'Le calque doit être visible dans les pixels encodés.');
});
test('Lecture privée signée, HTTP Range et refus des signatures altérées', async () => {
  const playback = await (await api(`/videos/${videoId}/playback`)).json();
  assert.equal(playback.type, 'mp4');
  const video = await fetch(playback.url, { headers: { Range: 'bytes=0-99' } });
  assert.equal(video.status, 206);
  assert.equal((await video.arrayBuffer()).byteLength, 100);
  const bad = new URL(playback.url);
  bad.searchParams.set('signature', 'a'.repeat(43));
  assert.equal((await fetch(bad)).status, 404);
  assert.equal(
    (await fetch(playback.url, { headers: { Range: 'bytes=999999999-' } }))
      .status,
    416,
  );
  assert.equal((await fetch(playback.thumbnail)).status, 200);
});
test('Publication et droits : public, non répertorié, privé, profil privé', async () => {
  await api('/videos/' + videoId, 'PATCH', { visibility: 'public' });
  assert.equal((await api(`/videos/${videoId}/publish`, 'POST')).status, 201);
  assert.equal(
    (await api(`/videos/${videoId}/playback`, 'GET', undefined, null)).status,
    200,
  );
  assert.ok(
    (await (await api('/videos/public', 'GET', undefined, null)).json()).some(
      (v) => v.id === videoId,
    ),
  );
  await api('/videos/' + videoId, 'PATCH', { visibility: 'unlisted' });
  assert.ok(
    !(await (await api('/videos/public', 'GET', undefined, null)).json()).some(
      (v) => v.id === videoId,
    ),
  );
  assert.equal(
    (await api(`/videos/${videoId}/playback`, 'GET', undefined, null)).status,
    200,
  );
  await api('/me/profile', 'PATCH', { isPrivate: true });
  assert.equal(
    (await api(`/videos/${videoId}/playback`, 'GET', undefined, null)).status,
    404,
  );
  await api('/me/profile', 'PATCH', { isPrivate: false });
  await api('/videos/' + videoId, 'PATCH', { visibility: 'private' });
  assert.equal(
    (await api(`/videos/${videoId}/playback`, 'GET', undefined, tokenB)).status,
    404,
  );
  await api(`/videos/${videoId}/unpublish`, 'POST');
  assert.equal((await api('/videos/' + videoId)).status, 200);
});
test('Miniature modifiée en arrière-plan et format verrouillé après l’envoi', async () => {
  const before = readFileSync(await storage.path(videoId, 'poster.jpg'));
  assert.equal(
    (await api('/videos/' + videoId, 'PATCH', { thumbnailTime: 0.75 })).status,
    200,
  );
  await worker.process(videoId);
  const after = readFileSync(await storage.path(videoId, 'poster.jpg'));
  assert.notDeepEqual(before, after);
  assert.equal(
    (await db.video.findUnique({ where: { id: videoId } })).thumbnailPending,
    false,
  );
  assert.equal(
    (await api('/videos/' + videoId, 'PATCH', { kind: 'long' })).status,
    409,
  );
});
test('Rejet d’un faux média et d’une miniature hors durée', async () => {
  const v = await reserve({ size: 32 });
  await api(`/videos/${v.id}/content`, 'PUT', Buffer.alloc(32), tokenA, {
    'upload-offset': '0',
  });
  await api(`/videos/${v.id}/complete`, 'POST');
  await worker.process(v.id);
  assert.equal(
    (await db.video.findUnique({ where: { id: v.id } })).status,
    'rejected',
  );
  assert.equal(
    (await api('/videos/' + videoId, 'PATCH', { thumbnailTime: 100 })).status,
    400,
  );
});
test('Reprise après bail expiré : tentatives bornées puis relance explicite', async () => {
  const v = await reserve();
  await api(`/videos/${v.id}/content`, 'PUT', source, tokenA, {
    'upload-offset': '0',
  });
  await api(`/videos/${v.id}/complete`, 'POST');
  await db.video.update({
    where: { id: v.id },
    data: {
      status: 'optimizing',
      attempts: 3,
      leaseId: 'dead-worker',
      leaseUntil: new Date(Date.now() - 1000),
    },
  });
  await worker.process(v.id);
  const failed = await db.video.findUniqueOrThrow({ where: { id: v.id } });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.errorCode, 'MEDIA_RETRY_LIMIT');
  assert.equal((await api(`/videos/${v.id}/retry`, 'POST')).status, 201);
  await worker.process(v.id);
  assert.equal(
    (await db.video.findUniqueOrThrow({ where: { id: v.id } })).status,
    'ready',
  );
});
test('Quotas concurrents : cinq imports actifs au maximum', async () => {
  const before = await db.video.findMany({ where: { issuer, status: { in: ['draft','uploading','queued','analyzing','optimizing','transferring','mux_processing'] } }, select: { id:true,status:true,title:true } });
  const created = await Promise.all(
    Array.from({ length: 7 }, () =>
      api('/videos', 'POST', { title: 'Quota', size: 100 }),
    ),
  );
  assert.equal(created.filter((r) => r.status === 201).length, 5, JSON.stringify({ before, statuses: created.map(r=>r.status) }));
  assert.equal(created.filter((r) => r.status === 409).length, 2);
  await db.video.updateMany({
    where: { issuer, status: 'draft' },
    data: { status: 'deleted' },
  });
});
test('Import concurrent : attente du verrou propriétaire supérieure à cinq secondes', async () => {
  const { VideosService } = require('../dist/videos/videos.service.js');
  const service = app.get(VideosService), original = service.create;
  let diagnosis = '', held;
  const locked = new Promise(resolve => { held = resolve; });
  service.create = async (...args) => { try { return await original.apply(service, args); } catch (error) { diagnosis = String(error.code || error.name); throw error; } };
  const blocker = db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${issuer + '|' + fixture + '-a'},0))`;
    held();
    await new Promise(resolve => setTimeout(resolve, 6000));
  }, { timeout: 15000 });
  let response;
  try { await locked; response = await api('/videos', 'POST', { title: 'Contention QA', size: 100 }); }
  finally { service.create = original; await blocker; }
  assert.equal(response.status, 201, 'Résultat sous contention : ' + response.status + ', Prisma ' + diagnosis);
  const created = await response.json();
  await db.video.update({ where: { id: created.id }, data: { status: 'deleted' } });
});

test('Vidéo longue horizontale : durée supérieure au short acceptée sans recadrage', async () => {
  const bytes = readFileSync(root + '/fixture-long.mp4');
  assert.ok(bytes.length < 4 * 1024 * 1024);
  for (const kind of ['short', 'long']) {
    const v = await reserve({
      kind,
      size: bytes.length,
      title: 'Horizontale ' + kind,
    });
    assert.equal(
      (
        await api(`/videos/${v.id}/content`, 'PUT', bytes, tokenA, {
          'upload-offset': '0',
        })
      ).status,
      200,
    );
    await api(`/videos/${v.id}/complete`, 'POST');
    await worker.process(v.id);
    const result = await db.video.findUniqueOrThrow({ where: { id: v.id } });
    if (kind === 'short') {
      assert.equal(result.status, 'rejected');
      assert.equal(result.errorCode, 'MEDIA_DURATION_LIMIT');
    } else {
      assert.equal(result.status, 'ready', result.errorCode || '');
      assert.ok(result.duration > 180);
      assert.equal(result.width, 160);
      assert.equal(result.height, 90);
      assert.equal((await api(`/videos/${v.id}/playback`)).status, 200);
    }
  }
});
test('Webhooks Mux : signature, ancienneté, idempotence et absence de régression', async () => {
  const v = await db.video.create({
    data: {
      issuer,
      subject: fixture + '-a',
      title: 'Mux simulé',
      driver: 'mux',
      expectedBytes: 10,
      status: 'mux_processing',
      expiresAt: new Date(Date.now() + 3600000),
      muxAssetId: fixture + 'asset',
    },
  });
  const raw = Buffer.from(
    JSON.stringify({
      id: fixture + '-ready',
      type: 'video.asset.ready',
      data: {
        id: v.muxAssetId,
        passthrough: v.muxAttempt,
        playback_ids: [{ id: 'SignedPlaybackTest', policy: 'signed' }],
        duration: 2,
      },
    }),
  );
  const signature = (t) =>
    't=' +
    t +
    ',v1=' +
    createHmac('sha256', process.env.MUX_WEBHOOK_SECRET)
      .update(t + '.')
      .update(raw)
      .digest('hex');
  const send = (s) =>
    fetch(base + '/videos/mux/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'mux-signature': s },
      body: raw,
    });
  assert.equal((await send('t=0,v1=' + 'a'.repeat(64))).status, 400);
  assert.equal(
    (await send(signature(Math.floor(Date.now() / 1000) - 600))).status,
    400,
  );
  const valid = signature(Math.floor(Date.now() / 1000));
  assert.equal((await send(valid)).status, 201);
  assert.equal((await send(valid)).status, 201);
  assert.equal(
    await db.videoWebhook.count({ where: { id: fixture + '-ready' } }),
    1,
  );
  assert.equal(
    (await db.video.findUnique({ where: { id: v.id } })).status,
    'ready',
  );
  await db.video.update({ where: { id: v.id }, data: { status: 'deleted' } });
  const later = Buffer.from(
    raw.toString().replace(fixture + '-ready', fixture + '-later'),
  );
  const t = Math.floor(Date.now() / 1000);
  const signed =
    't=' +
    t +
    ',v1=' +
    createHmac('sha256', process.env.MUX_WEBHOOK_SECRET)
      .update(t + '.')
      .update(later)
      .digest('hex');
  await fetch(base + '/videos/mux/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mux-signature': signed },
    body: later,
  });
  assert.equal(
    (await db.video.findUnique({ where: { id: v.id } })).status,
    'deleted',
  );
});
test('Suppression : arrêt de lecture immédiat et nettoyage des fichiers', async () => {
  const playback = await (await api(`/videos/${videoId}/playback`)).json();
  await api('/videos/' + videoId, 'DELETE');
  assert.equal((await fetch(playback.url)).status, 404);
  await worker.process(videoId);
  assert.ok(
    (await db.video.findUnique({ where: { id: videoId } })).deletedCleanedAt,
  );
});
