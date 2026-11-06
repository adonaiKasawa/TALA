import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { accessToken } from "@/lib/oidc";
import { json, readBody, sessionRequest, upstream } from "@/lib/http";
function path(parts: string[], method: string) {
  if (!parts.length)
    return method === "GET"
      ? "/me/videos"
      : method === "POST"
        ? "/videos"
        : null;
  if (parts.length === 1 && parts[0] === "options" && method === "GET")
    return "/videos/options";
  if (!/^[a-f0-9-]{36}$/i.test(parts[0])) return null;
  if (parts.length === 1 && ["GET", "PATCH", "DELETE"].includes(method))
    return "/videos/" + parts[0];
  if (
    parts.length === 2 &&
    ((method === "PUT" && ["content", "overlay"].includes(parts[1])) ||
      (method === "GET" && parts[1] === "playback") ||
      (method === "POST" &&
        ["complete", "publish", "unpublish", "retry"].includes(parts[1])))
  )
    return "/videos/" + parts.join("/");
  return null;
}
async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ parts?: string[] }> },
) {
  const target = path((await ctx.params).parts || [], req.method);
  if (!target) return json({ message: "Route indisponible." }, 404);
  return sessionRequest(req, async (session) => {
    if (req.method === "PUT") {
      const overlay = target.endsWith("/overlay");
      const offset = req.headers.get("upload-offset");
      if (!overlay && (!offset || !/^\d{1,10}$/.test(offset)))
        return json({ message: "Position d’envoi invalide." }, 400);
      if (
        req.headers.get("content-type") !==
        (overlay ? "image/png" : "application/octet-stream")
      )
        return json({ message: "Bloc vidéo requis." }, 400);
      const reader = req.body?.getReader();
      if (!reader) return json({ message: "Bloc vide." }, 400);
      const parts: Uint8Array[] = [];
      let size = 0,
        expired = false;
      const timeout = setTimeout(() => {
        expired = true;
        void reader.cancel().catch(() => {});
      }, 30000);
      try {
        for (;;) {
          const item = await reader.read();
          if (expired)
            return json(
              { message: "Envoi interrompu. Reprenez le bloc." },
              408,
            );
          if (item.done) break;
          size += item.value.length;
          if (size > 4 * 1024 * 1024) {
            await reader.cancel();
            return json({ message: "Bloc de 4 Mo maximum." }, 413);
          }
          parts.push(item.value);
        }
      } finally {
        clearTimeout(timeout);
      }
      const c = config(),
        token = await accessToken(session, c.apiAudience);
      const response = await fetch(c.api + "/api/v1" + target, {
        method: "PUT",
        headers: {
          authorization: "Bearer " + token,
          "content-type": overlay ? "image/png" : "application/octet-stream",
          ...(!overlay && offset ? { "upload-offset": offset } : {}),
        },
        body: Buffer.concat(parts),
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      });
      return json(await response.json(), response.status);
    }
    let body: unknown;
    if (
      ["POST", "PATCH"].includes(req.method) &&
      req.headers.get("content-length") !== "0" &&
      req.body
    ) {
      try {
        body = await readBody(req);
      } catch {
        return json({ message: "Vérifiez le formulaire." }, 400);
      }
    }
    const result = await upstream(session, "api", target, req.method, body);
    return json(result.data, result.status);
  });
}
export const GET = handle,
  POST = handle,
  PATCH = handle,
  DELETE = handle,
  PUT = handle;
