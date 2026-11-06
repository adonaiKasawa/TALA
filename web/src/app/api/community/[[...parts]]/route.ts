import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { json, readBody, sessionRequest, upstream } from "@/lib/http";
const uuid = "[a-fA-F0-9-]{36}",
  user = "[a-zA-Z0-9_]{3,30}";
function allowed(path: string, method: string) {
  const routes: Record<string, RegExp[]> = {
    GET: [
      /^search$/,
      /^me\/(library|conversations)$/,
      new RegExp(`^conversations/${uuid}/messages$`),
      /^feed$/,
      /^me\/(history|creator-controls)$/,
      new RegExp(`^profiles/${user}$`),
      new RegExp(`^creators/${user}/(followers|following)$`),
      new RegExp(`^videos/${uuid}/(social|comments)$`),
    ],
    POST: [
      /^me\/conversations$/,
      new RegExp(`^conversations/${uuid}/messages$`),
      /^watch\/impressions$/,
      new RegExp(`^videos/${uuid}/comments$`),
    ],
    PUT: [
      new RegExp(`^conversations/${uuid}/read$`),
      new RegExp(`^watch/${uuid}$`),
      new RegExp(`^videos/${uuid}/reactions/(like|save|not_interested)$`),
      new RegExp(`^creators/${user}/relations/(follow|block|mute|restrict)$`),
      new RegExp(`^videos/${uuid}/captions/[a-z]{2,3}(-[A-Z]{2})?$`),
    ],
    DELETE: [
      /^me\/history$/,
      new RegExp(`^videos/${uuid}/comments/${uuid}$`),
      new RegExp(`^videos/${uuid}/reactions/(like|save|not_interested)$`),
      new RegExp(`^creators/${user}/relations/(follow|block|mute|restrict)$`),
      new RegExp(`^videos/${uuid}/captions/[a-z]{2,3}(-[A-Z]{2})?$`),
    ],
  };
  return routes[method]?.some((r) => r.test(path));
}
async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ parts?: string[] }> },
) {
  const path = (await ctx.params).parts?.join("/") || "";
  if (!allowed(path, req.method))
    return json({ message: "Route indisponible." }, 404);
  if (req.nextUrl.search.length > 1500)
    return json({ message: "Requête trop longue." }, 400);
  const target = "/" + path + req.nextUrl.search;
  const privateRead =
    path.startsWith("me/") || path.startsWith("conversations/");
  if (
    req.method === "GET" &&
    !privateRead &&
    !req.cookies.has("tala_session")
  ) {
    try {
      const r = await fetch(config().api + "/api/v1" + target, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      return json(await r.json(), r.status);
    } catch {
      return json({ message: "Le fil est temporairement indisponible." }, 503);
    }
  }
  return sessionRequest(req, async (session) => {
    let body: unknown;
    const requiresBody =
      req.method === "POST" ||
      (req.method === "PUT" &&
        (path.startsWith("watch/") || path.includes("/captions/")));
    if (requiresBody) {
      try {
        body = await readBody(req);
      } catch {
        return json({ message: "Vérifiez les champs." }, 400);
      }
    }
    const r = await upstream(session, "api", target, req.method, body);
    return json(r.data, r.status);
  });
}
export const GET = handle,
  POST = handle,
  PUT = handle,
  DELETE = handle;
