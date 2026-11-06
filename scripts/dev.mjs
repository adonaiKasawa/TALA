import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "authserver/package.json"));
const { parse } = require("dotenv");
const portable = resolve(
  root,
  "authserver/.local/node24/node-v24.22.1-win-x64/node.exe",
);
const runtime = process.release.lts
  ? process.execPath
  : existsSync(portable)
    ? portable
    : undefined;
if (!runtime) throw new Error("Installer Node.js 24 LTS.");
const auth = parse(readFileSync(resolve(root, "authserver/.env")));
const api = parse(readFileSync(resolve(root, "api/.env")));
if (auth.NODE_ENV === "production" || api.NODE_ENV === "production")
  throw new Error("Ce lanceur est réservé au développement local.");
for (const port of [3000, 4000, 4001, 1025, 8025]) {
  await new Promise((done, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} déjà occupé : arrêter le service concerné dans son terminal avant npm run dev.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(done));
  });
}
for (const file of [
  "authserver/dist/main.js",
  "api/dist/main.js",
  "web/.next/BUILD_ID",
  "web/.env.local",
  ".local/mailpit/mailpit.exe",
]) {
  if (!existsSync(resolve(root, file)))
    throw new Error(
      `Fichier requis absent : ${file}. Suivre docs/clients-web-mobile.md.`,
    );
}
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.connected) {
      child.send("stop", () => {});
      setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 10000).unref();
    } else child.kill();
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
function launch(executable, args, cwd, extra = {}) {
  const child = spawn(executable, args, {
    cwd: resolve(root, cwd),
    env: { ...process.env, ...extra },
    stdio: args.includes("dist/media-worker.js")
      ? ["inherit", "inherit", "inherit", "ipc"]
      : "inherit",
    windowsHide: true,
  });
  children.add(child);
  child.on("error", () => {
    console.error(`Lancement impossible : ${cwd}`);
    stop(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping) stop(code || 1);
  });
  return child;
}
launch(
  resolve(root, ".local/mailpit/mailpit.exe"),
  [
    "--smtp",
    "127.0.0.1:1025",
    "--listen",
    "127.0.0.1:8025",
    "--allowed-hosts",
    "localhost,127.0.0.1",
    "--disable-version-check",
    "--smtp-disable-rdns",
    "--quiet",
    "--max-age",
    "24h",
    "--max",
    "100",
  ],
  ".",
);
launch(runtime, ["dist/main.js"], "authserver", {
  ...auth,
  NODE_ENV: "development",
  AUTH_PORT: "4000",
  HOST: "127.0.0.1",
  AUTH_WEB_ORIGIN: "http://localhost:3000",
  SMTP_URL: "smtp://127.0.0.1:1025",
});
launch(runtime, ["dist/main.js"], "api", {
  ...api,
  NODE_ENV: "development",
  API_PORT: "4001",
  HOST: "127.0.0.1",
});
if (api.MEDIA_ENABLED === "true")
  launch(runtime, ["dist/media-worker.js"], "api", {
    ...api,
    NODE_ENV: "development",
  });
launch(
  runtime,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3000"],
  "web",
  {
    NODE_ENV: "production",
    ALLOW_LOCAL_HTTP: "true",
    NEXT_TELEMETRY_DISABLED: "1",
  },
);
console.log(
  `TALA local : http://localhost:3000 — Emails : http://localhost:8025 — Worker média ${api.MEDIA_ENABLED === "true" ? "actif" : "désactivé"} — Ctrl+C pour arrêter les services.`,
);
