import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let runtime = process.execPath;
if (!process.release.lts || Number(process.versions.node.split('.')[0]) < 22) {
  const portable = resolve(root, '.local/node24');
  const candidates = existsSync(portable)
    ? readdirSync(portable).filter(name => name.startsWith('node-v24.'))
        .map(name => resolve(portable, name, process.platform === 'win32' ? 'node.exe' : 'bin/node'))
    : [];
  runtime = candidates.find(existsSync);
  if (!runtime) {
    console.error('AuthServer : installer Node.js 24 LTS, puis relancer npm run start:prod.');
    process.exit(1);
  }
}

const child = spawn(runtime, ['--env-file-if-exists=.env', 'dist/main.js'], {
  cwd: root,
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', error => {
  console.error(`AuthServer : lancement impossible (${error.code ?? 'runtime'}).`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
