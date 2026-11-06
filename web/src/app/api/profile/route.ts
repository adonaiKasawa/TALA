import { NextRequest } from "next/server";
import { json, readBody, sessionRequest, upstream } from "@/lib/http";
async function handle(req: NextRequest) {
  return sessionRequest(req, async (session) => {
    let body: unknown;
    if (["POST", "PATCH"].includes(req.method)) {
      try {
        body = await readBody(req);
      } catch {
        return json({ message: "Vérifiez le formulaire." }, 400);
      }
    }
    const result = await upstream(
      session,
      "api",
      "/me/profile",
      req.method,
      body,
    );
    return json(result.data, result.status);
  });
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
