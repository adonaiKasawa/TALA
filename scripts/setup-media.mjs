import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  folder = resolve(root, ".local/ffmpeg");
if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error(
    "Installer FFmpeg/ffprobe avec le gestionnaire de paquets de cet OS, puis configurer les chemins dans api/.env.",
  );
const ffmpeg = resolve(folder, "ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe");
try {
  await access(ffmpeg);
} catch {
  await mkdir(folder, { recursive: true });
  const response = await fetch(
    "https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip",
  );
  if (!response.ok) throw new Error("Téléchargement FFmpeg impossible.");
  const zip = Buffer.from(await response.arrayBuffer());
  if (
    createHash("sha256").update(zip).digest("hex") !==
    "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba"
  )
    throw new Error("Somme FFmpeg incorrecte.");
  await writeFile(resolve(folder, "archive.zip"), zip);
  const script =
    "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory((Join-Path (Get-Location) '.local/ffmpeg/archive.zip'), (Join-Path (Get-Location) '.local/ffmpeg'), $true)";
  if (
    spawnSync("pwsh", ["-NoProfile", "-Command", script], {
      cwd: root,
      windowsHide: true,
      stdio: "inherit",
    }).status !== 0
  )
    throw new Error("Extraction FFmpeg impossible.");
}
const file = resolve(root, "api/.env");
let env = await readFile(file, "utf8");
for (const [key, value] of Object.entries({
  MEDIA_ENABLED: "true",
  MEDIA_DRIVER: "local",
  MEDIA_QUEUE_DRIVER: "postgres",
  MEDIA_ROOT: resolve(root, "api/.local/media").replaceAll("\\", "/"),
  MEDIA_ORIGIN: "http://localhost:4001",
  MEDIA_SIGNING_KEY: randomBytes(32).toString("hex"),
  FFMPEG_PATH: ffmpeg.replaceAll("\\", "/"),
  FFPROBE_PATH: ffmpeg
    .replace("ffmpeg.exe", "ffprobe.exe")
    .replaceAll("\\", "/"),
  MUX_TEST_ASSETS: "true",
})) {
  const exists = new RegExp("^" + key + "=", "m").test(env);
  const replace =
    key === "MEDIA_ENABLED" ||
    (key === "MEDIA_SIGNING_KEY" &&
      !/^MEDIA_SIGNING_KEY=["']?[a-f0-9]{64}["']?\r?$/im.test(env)) ||
    ((key === "FFMPEG_PATH" || key === "FFPROBE_PATH") &&
      new RegExp("^" + key + "=[\"']?ff(?:mpeg|probe)[\"']?\\r?$", "m").test(
        env,
      ));
  if (!exists || replace) {
    env = env.replace(new RegExp("^" + key + "=.*\\r?\\n?", "gm"), "");
    env += "\n" + key + "=" + JSON.stringify(value) + "\n";
  }
}
await writeFile(file, env, { mode: 0o600 });
console.log(
  "Média local configuré : stockage privé, FFmpeg et file PostgreSQL ; aucun Docker requis.",
);
