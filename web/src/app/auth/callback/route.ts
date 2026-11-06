import { NextRequest, NextResponse } from "next/server";
import * as oidc from "openid-client";
import { config } from "@/lib/config";
import { client } from "@/lib/oidc";
import { random, put, take, equal, remove, type Session } from "@/lib/store";

export async function GET(req: NextRequest) {
  const c = config(),
    state = req.nextUrl.searchParams.get("state"),
    cookie = req.cookies.get("tala_flow")?.value;
  try {
    if (!state || !cookie || !equal(state, cookie))
      throw new Error("Invalid state");
    const flow = await take<{ state: string; verifier: string; nonce: string }>(
      state,
      "flow",
    );
    if (!flow) throw new Error("Expired flow");
    const callback = new URL("/auth/callback", c.origin);
    callback.search = req.nextUrl.search;
    const result = await oidc.authorizationCodeGrant(
      await client(),
      callback,
      {
        pkceCodeVerifier: flow.verifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce,
      },
      { resource: c.apiAudience },
    );
    const claims = result.claims();
    if (!result.refresh_token || !result.id_token || !claims?.sub)
      throw new Error("Missing session");
    const id = random();
    const session: Session = {
      csrf: random(),
      subject: claims.sub,
      refresh: result.refresh_token,
      idToken: result.id_token,
      tokens: {
        [c.apiAudience]: {
          value: result.access_token,
          expires: Date.now() + (result.expires_in || 300) * 1000,
        },
      },
    };
    await put(id, "session", session, 1209600);
    const previous = req.cookies.get("tala_session")?.value;
    if (previous) await remove(previous);
    const response = NextResponse.redirect(new URL("/compte", c.origin));
    response.cookies.set("tala_session", id, {
      httpOnly: true,
      secure: c.secure,
      sameSite: "lax",
      path: "/",
      maxAge: 1209600,
    });
    response.cookies.set("tala_flow", "", { path: "/auth", maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    const response = NextResponse.redirect(
      new URL("/?connexion=interrompue", c.origin),
    );
    response.cookies.set("tala_flow", "", { path: "/auth", maxAge: 0 });
    return response;
  }
}
