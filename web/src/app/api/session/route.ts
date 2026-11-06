import { NextRequest } from "next/server";
import { json, sessionRequest, upstream } from "@/lib/http";
export async function GET(req: NextRequest) {
  return sessionRequest(req, async (session) => {
    const identity = await upstream(session, "identity", "/account/me");
    if (identity.status !== 200) return json(identity.data, identity.status);
    const profile = await upstream(session, "api", "/me/profile");
    if (![200, 404].includes(profile.status))
      return json(profile.data, profile.status);
    return json({
      csrf: session.csrf,
      identity: identity.data,
      profile: profile.status === 200 ? profile.data : null,
    });
  });
}
