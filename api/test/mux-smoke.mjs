// Explicit opt-in. Uploads only a generated, disposable, free Mux test asset.
import 'dotenv/config';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import {
  readFileSync,
  copyFileSync,
  mkdirSync,
  unlinkSync,
  rmdirSync,
  readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
if (process.env.RUN_MUX_SMOKE !== '1' || process.env.NODE_ENV === 'production')
  throw new Error('RUN_MUX_SMOKE=1 requis, hors production.');
const { NestFactory } = require('@nestjs/core');
const { VideosModule } = require('../dist/videos/videos.module.js');
const { VideosService } = require('../dist/videos/videos.service.js');
const { MuxService } = require('../dist/videos/mux.service.js');
const fixture = 'mux-smoke-' + randomBytes(6).toString('hex');
const root = resolve('.local/' + fixture);
mkdirSync(root, { recursive: true });
process.env.NODE_ENV = 'test';
process.env.MEDIA_ENABLED = 'true';
process.env.MEDIA_DRIVER = 'mux';
process.env.MEDIA_QUEUE_DRIVER = 'postgres';
process.env.MEDIA_ROOT = root;
process.env.MUX_TEST_ASSETS = 'true';
let app, service, mux, record, failed;
try {
  const source = root + '/generated.mp4';
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
      '-t',
      '2',
      '-c:v',
      'libx264',
      '-threads',
      '2',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      source,
    ],
    { stdio: 'pipe' },
  );
  app = await NestFactory.createApplicationContext(VideosModule, {
    logger: ['error', 'warn'],
  });
  service = app.get(VideosService);
  mux = app.get(MuxService);
  record = await service.db.video.create({
    data: {
      issuer: fixture,
      subject: fixture,
      title: 'TALA generated integration test',
      driver: 'mux',
      isTest: true,
      expectedBytes: readFileSync(source).length,
      preparedBytes: readFileSync(source).length,
      status: 'transferring',
      duration: 2,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const path = await service.storage.path(record.id, 'prepared.mp4');
  copyFileSync(source, path);
  await mux.transfer(record, path);
  await service.db.video.updateMany({
    where: { id: record.id, status: 'transferring' },
    data: { status: 'mux_processing' },
  });
  for (let i = 0; i < 30; i++) {
    record = await service.db.video.findUniqueOrThrow({
      where: { id: record.id },
    });
    await mux.reconcile(record);
    record = await service.db.video.findUniqueOrThrow({
      where: { id: record.id },
    });
    if (record.status === 'ready') break;
    if (record.status === 'failed') throw new Error('Mux encoding failed');
    await new Promise((done) => setTimeout(done, 2000));
  }
  assert.equal(record.status, 'ready');
  assert.ok(record.muxPlaybackId);
  const playback = await mux.playback(record);
  const manifest = await fetch(playback.url, {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(manifest.status, 200);
  assert.match(await manifest.text(), /#EXTM3U/);
  const thumbnail = await fetch(playback.thumbnail, {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(thumbnail.status, 200);
  await thumbnail.body?.cancel();
  console.log(
    'Mux réel : transfert test, encodage, lecture HLS signée et miniature vérifiés.',
  );
} catch (error) {
  failed = error;
  console.error(
    'Test Mux non abouti : ' +
      (error.code || error.status || error.name) +
      ' ' +
      String(error.message || '')
        .replace(/https?:\/\/[^\s]+/g, '[URL]')
        .slice(0, 250),
  );
  process.exitCode = 1;
} finally {
  if (service && record) {
    record = await service.db.video.findUniqueOrThrow({
      where: { id: record.id },
    });
    try {
      await mux.cleanup(record);
      await service.storage.removeFiles(record.id);
      await service.db.video.delete({ where: { id: record.id } });
    } catch {
      console.error(
        'Nettoyage Mux à reprendre pour le test identifié dans la base.',
      );
      process.exitCode = 1;
    }
  }
  await app?.close();
  try {
    unlinkSync(root + '/generated.mp4');
    if (readdirSync(root).length === 0) rmdirSync(root);
  } catch {}
}
