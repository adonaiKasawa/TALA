export function identityPath(parts: string[], method: string) {
  const path = parts.join("/");
  const fixed: Record<string, string[]> = {
    me: ["GET", "PATCH"],
    "password/change": ["POST"],
    "mfa/enroll": ["POST"],
    "mfa/confirm": ["POST"],
    "mfa/disable": ["POST"],
    "mfa/recovery-codes": ["POST"],
    sessions: ["GET"],
    "sessions/revoke-all": ["POST"],
    grants: ["GET"],
    export: ["GET"],
    identities: ["GET"],
    reauthenticate: ["POST"],
  };
  if (
    fixed[path]?.includes(method) ||
    (method === "DELETE" && /^(sessions|grants)\/[A-Za-z0-9_-]+$/.test(path)) ||
    (method === "DELETE" && /^identities\/[a-z0-9-]+$/.test(path)) ||
    (method === "POST" && /^identities\/[a-z0-9-]+\/link$/.test(path))
  )
    return "/account/" + path;
  return null;
}
