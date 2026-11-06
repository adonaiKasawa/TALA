import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testDatabase } from './test-database.mjs';
import { parseArgs } from 'node:util';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'api/package.json'));
const env = require('dotenv').parse(readFileSync(resolve(root, 'api/.env')));
const { values, positionals: files } = parseArgs({ options: { name: { type: 'string' } }, allowPositionals: true });
if (files.some(file => !['api', 'videos', 'feed', 'watch-tracker', 'community', 'ranking'].includes(file))) throw new Error('Suite de test inconnue.');
const db = await testDatabase(env);
let authDatabase;
try {
  if (!files.length || files.includes('api')) authDatabase = await testDatabase(require('dotenv').parse(readFileSync(resolve(root, 'authserver/.env'))), process.execPath, 'authserver');
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...(values.name ? ['--test-name-pattern', values.name] : []), ...(files.length ? files : ['api', 'videos', 'feed', 'watch-tracker', 'community', 'ranking']).map(file => `test/${file}.test.mjs`)], {
    cwd: resolve(root, 'api'), env: { ...process.env, ...env, NODE_ENV: 'test', IDENTITY_SYNC_KEY: '', DATABASE_URL: db.url, TEST_AUTH_DATABASE_URL: authDatabase?.url }, stdio: 'inherit', windowsHide: true,
  });
  process.exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', code => done(code ?? 1)); });
} finally { await authDatabase?.dispose(); await db.dispose(); }


