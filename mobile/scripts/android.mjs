import { spawn, execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (process.platform === 'win32' ? resolve(process.env.LOCALAPPDATA || '', 'Android/Sdk') : undefined);
const env = { ...process.env, ...(sdk ? { ANDROID_HOME: sdk } : {}) };
const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
const adb = sdk ? resolve(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb';
let architectures = 'arm64-v8a,x86_64';
try { const abi = execFileSync(adb, ['shell', 'getprop', 'ro.product.cpu.abi'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); if (['arm64-v8a', 'x86_64', 'armeabi-v7a', 'x86'].includes(abi)) architectures = abi; } catch {}
async function run(executable, args, cwd) {
  const child = spawn(executable, args, { cwd, env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  return new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
}
const result = await run(java, ['-classpath', 'gradle/wrapper/gradle-wrapper.jar', 'org.gradle.wrapper.GradleWrapperMain', ':app:assembleDebug', `-PreactNativeArchitectures=${architectures}`, '--console=plain'], resolve(root, 'android'));
if (result !== 0) process.exit(Number(result));
const apk = resolve(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(apk)) throw new Error('APK de développement introuvable.');
if (process.argv.includes('--build-only')) { console.log('APK Android compilé.'); process.exit(0); }
for (const port of [4000, 4001]) { try { execFileSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'ignore' }); } catch {} }
process.exitCode = Number(await run(process.execPath, ['node_modules/react-native/cli.js', 'run-android', '--binary-path', apk, '--no-packager'], root));
