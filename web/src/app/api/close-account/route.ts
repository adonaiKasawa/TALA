import { NextRequest } from "next/server";
import { json, readBody, sessionRequest, upstream } from "@/lib/http";
import { remove } from "@/lib/store";
export async function POST(req: NextRequest) {
  const result = await sessionRequest(req, async (session) => {
    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      return json({ message: "Vérifiez le formulaire." }, 400);
    }
    const proof = await upstream(
      session,
      "identity",
      "/account/reauthenticate",
      "POST",
      body,
    );
    if (proof.status !== 201) return json(proof.data, proof.status);
    const profile = await upstream(session, "api", "/me/profile", "DELETE");
    if (profile.status !== 200) return json(profile.data, profile.status);
    const identity = await upstream(
      session,
      "identity",
      "/account/me",
      "DELETE",
      body,
    );
    if (identity.status !== 200)
      return json(
        {
          message:
            "Votre profil est supprimé. La fermeture du compte n’a pas abouti ; réessayez depuis cette page.",
          partial: true,
        },
        identity.status,
      );
    return json({ message: "Votre compte et votre profil ont été supprimés." });
  });
  if (result.status === 200) {
    const id = req.cookies.get("tala_session")?.value;
    if (id) await remove(id);
    result.cookies.set("tala_session", "", { path: "/", maxAge: 0 });
  }
  return result;
}
