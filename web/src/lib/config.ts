import "server-only";

export function config() {
  const env = process.env;
  for (const name of [
    "WEB_ORIGIN",
    "OIDC_ISSUER",
    "API_ORIGIN",
    "OIDC_CLIENT_ID",
    "OIDC_CLIENT_SECRET",
    "WEB_DATABASE_URL",
    "WEB_SESSION_KEY",
  ])
    if (!env[name]) throw new Error(`Configuration web manquante : ${name}`);
  if (!/^[a-f0-9]{64}$/i.test(env.WEB_SESSION_KEY!))
    throw new Error("Clé de session web invalide");
  const origin = new URL(env.WEB_ORIGIN!),
    issuer = new URL(env.OIDC_ISSUER!),
    api = new URL(env.API_ORIGIN!);
  for (const url of [origin, issuer, api]) {
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("Origines web invalides");
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw new Error("HTTPS requis hors environnement local");
  }
  if (
    env.NODE_ENV === "production" &&
    origin.protocol !== "https:" &&
    env.ALLOW_LOCAL_HTTP !== "true"
  )
    throw new Error("HTTPS requis en production");
  return {
    origin: origin.origin,
    issuer: issuer.origin,
    api: api.origin,
    clientId: env.OIDC_CLIENT_ID!,
    secret: env.OIDC_CLIENT_SECRET!,
    database: env.WEB_DATABASE_URL!,
    key: env.WEB_SESSION_KEY!,
    apiAudience: env.API_AUDIENCE || "urn:tala:api",
    identityAudience: env.IDENTITY_AUDIENCE || "urn:tala:identity",
    secure: origin.protocol === "https:",
  };
}
