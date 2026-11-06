import { NextRequest, NextResponse } from "next/server";
import * as oidc from "openid-client";
import { config } from "@/lib/config";
import { json, sessionRequest } from "@/lib/http";
import { client } from "@/lib/oidc";
import { digest } from "@/lib/store";
export async function POST(req: NextRequest) {
  const id = req.cookies.get("tala_session")?.value;
  const response = await sessionRequest(req, async (session) => {
    let redirect = config().origin + "/";
    try {
      redirect = oidc
        .buildEndSessionUrl(await client(), {
          id_token_hint: session.idToken,
          post_logout_redirect_uri: config().origin + "/",
        })
        .toString();
    } catch {}
    try {
      await oidc.tokenRevocation(await client(), session.refresh);
    } catch {}
    return json({ redirect });
  });
  if (id && response.status === 200) {
    const { pool } = await import("@/lib/store");
    await pool().query("DELETE FROM tala_web.sessions WHERE id=$1", [
      digest(id),
    ]);
    response.cookies.set("tala_session", "", { path: "/", maxAge: 0 });
  }
  return response as NextResponse;
}
