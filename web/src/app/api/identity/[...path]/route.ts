import { NextRequest } from "next/server";
import { json, readBody, sessionRequest, upstream } from "@/lib/http";
import { identityPath } from "@/lib/identity-paths";
async function handle(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = identityPath((await context.params).path, req.method);
  if (!path) return json({ message: "Cette action est indisponible." }, 404);
  return sessionRequest(req, async (session) => {
    let body: unknown;
    if (!["GET", "HEAD"].includes(req.method)) {
      try {
        body = await readBody(req);
      } catch {
        return json({ message: "Vérifiez le formulaire." }, 400);
      }
    }
    const result = await upstream(session, "identity", path, req.method, body);
    return json(result.data, result.status);
  });
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
