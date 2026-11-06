import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const directory = resolve('.local');
mkdirSync(directory, { recursive: true });
if (!existsSync(resolve(directory, 'jwks.json'))) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(resolve(directory, 'jwks.json'), JSON.stringify({ keys: [{ ...privateKey.export({ format: 'jwk' }), kid: randomBytes(12).toString('hex'), use: 'sig', alg: 'RS256' }] }), { mode: 0o600 });
}
if (!existsSync('.env')) {
  const databaseUrl = process.env.AUTH_DATABASE_URL || 'postgresql://postgres:CHANGE_ME@127.0.0.1:5432/tala_authserver';
  writeFileSync('.env', `NODE_ENV=development\nAUTH_PORT=4000\nHOST=127.0.0.1\nOIDC_ISSUER=http://localhost:4000\nAPI_AUDIENCE=urn:tala:api\nAUTH_DATABASE_URL=${databaseUrl}\nAUTH_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nAUTH_COOKIE_KEYS=${randomBytes(48).toString('base64url')}\nAUTH_JWKS_PATH=.local/jwks.json\nMAIL_FROM=identity@tala.example\n`, { mode: 0o600 });
}
console.log('Configuration locale créée sans écraser les clés existantes.');
