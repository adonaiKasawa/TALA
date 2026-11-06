import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { config } from "./config";
import { locked, equal, type Session } from "./store";
import { accessToken } from "./oidc";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function sessionRequest(
  req: NextRequest,
  work: (session: Session) => Promise<NextResponse>,
) {
  const id = req.cookies.get("tala_session")?.value;
  if (!id) return json({ message: "Connectez-vous pour continuer." }, 401);
  try {
    return await locked(id, async (session) => {
      if (
        !["GET", "HEAD"].includes(req.method) &&
        (req.headers.get("origin") !== config().origin ||
          !equal(req.headers.get("x-csrf-token") || "", session.csrf))
      )
        return json({ message: "Rechargez la page avant de réessayer." }, 403);
      return work(session);
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "SESSION_REQUIRED" ||
        ("code" in error && error.code === "OAUTH_RESPONSE_BODY_ERROR"))
    )
      return json(
        { message: "Votre session a expiré. Reconnectez-vous." },
        401,
      );
    return json(
      { message: "Le service est momentanément indisponible. Réessayez." },
      503,
    );
  }
}
export async function upstream(
  session: Session,
  target: "api" | "identity",
  path: string,
  method = "GET",
  body?: unknown,
) {
  const c = config(),
    resource = target === "api" ? c.apiAudience : c.identityAudience;
  const token = await accessToken(session, resource);
  const response = await fetch(
    `${target === "api" ? c.api + "/api/v1" : c.issuer}${path}`,
    {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  return { status: response.status, data: await response.json() };
}
export async function readBody(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("INVALID_BODY");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("INVALID_BODY");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 32768) {
      await reader.cancel();
      throw new Error("INVALID_BODY");
    }
    chunks.push(part.value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text) as unknown;
}
