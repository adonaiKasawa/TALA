import { NextRequest, NextResponse } from "next/server";
import * as oidc from "openid-client";
import { config } from "@/lib/config";
import { client } from "@/lib/oidc";
import { random, put } from "@/lib/store";

export async function GET(req: NextRequest) {
  const c = config(),
    state = random(),
    nonce = random(),
    verifier = oidc.randomPKCECodeVerifier();
  await put(state, "flow", { verifier, nonce, state }, 600);
  const url = oidc.buildAuthorizationUrl(await client(), {
    redirect_uri: `${c.origin}/auth/callback`,
    response_type: "code",
    prompt: "consent",
    max_age: "0",
    scope: "openid profile email offline_access tala.api tala.identity",
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    state,
    nonce,
    ...(req.nextUrl.searchParams.get("inscription") === "1"
      ? { tala_action: "register" }
      : {}),
  });
  url.searchParams.append("resource", c.apiAudience);
  url.searchParams.append("resource", c.identityAudience);
  const response = NextResponse.redirect(url);
  response.cookies.set("tala_flow", state, {
    httpOnly: true,
    secure: c.secure,
    sameSite: "lax",
    path: "/auth",
    maxAge: 600,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
