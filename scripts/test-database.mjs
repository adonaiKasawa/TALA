import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'api/package.json'));
const { Pool } = require('pg');
// Each test worker must see the same files and database. A running development
// worker must never claim a test upload from its unrelated private media root.
export async function testDatabase(env, executable = process.execPath, project = 'api') {
  if (!['api', 'authserver'].includes(project)) throw new Error('Projet de test inconnu.');
  const databaseKey = project === 'api' ? 'DATABASE_URL' : 'AUTH_DATABASE_URL';
  const url = new URL(env[databaseKey]);
  if (env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Base de test réservée au PostgreSQL local.');
  const name = 'tala_test_' + randomBytes(8).toString('hex');
  if (!/^tala_test_[a-f0-9]{16}$/.test(name)) throw new Error('Nom de base de test invalide.');
  const admin = new Pool({ connectionString: env[databaseKey], max: 1 });
  let created = false, disposed = false;
  const dispose = async () => {
    if (disposed) return;
    try { if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
    finally { disposed = true; await admin.end(); }
  };
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    url.pathname = '/' + name;
    execFileSync(executable, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      cwd: resolve(root, project), env: { ...process.env, ...env, NODE_ENV: 'test', [databaseKey]: url.toString() }, stdio: 'pipe', windowsHide: true,
    });
    return { url: url.toString(), name, dispose };
  } catch (error) { await dispose(); throw error; }
}
