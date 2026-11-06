import "server-only";
import * as oidc from "openid-client";
import { config } from "./config";
import type { Session } from "./store";
let clientPromise: Promise<oidc.Configuration> | undefined;
export function client() {
  const c = config();
  return (clientPromise ||= oidc.discovery(
    new URL(c.issuer),
    c.clientId,
    c.secret,
    oidc.ClientSecretBasic(c.secret),
    c.secure ? undefined : { execute: [oidc.allowInsecureRequests] },
  ));
}
export async function accessToken(session: Session, resource: string) {
  const existing = session.tokens[resource];
  if (existing && existing.expires > Date.now() + 30000) return existing.value;
  const tokens = await oidc.refreshTokenGrant(await client(), session.refresh, {
    resource,
  });
  if (!tokens.access_token || !tokens.refresh_token)
    throw new Error("SESSION_REQUIRED");
  session.refresh = tokens.refresh_token;
  if (tokens.id_token) session.idToken = tokens.id_token;
  session.tokens[resource] = {
    value: tokens.access_token,
    expires: Date.now() + (tokens.expires_in || 300) * 1000,
  };
  return tokens.access_token;
}
