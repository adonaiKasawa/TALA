import { Brand } from "@/components/Brand";
import Link from "next/link";
import Image from "next/image";
import { config } from "@/lib/config";
import type { Profile } from "@/components/types";
import { CreatorConnections } from "@/components/feed/CreatorConnections";
export const dynamic = "force-dynamic";
export default async function PublicProfile({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  let profile: Profile | null = null;
  try {
    const result = await fetch(
      `${config().api}/api/v1/profiles/${encodeURIComponent(username)}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (result.ok) profile = await result.json();
  } catch {}
  return (
    <main className="welcome">
      <header>
        <Link className="brand" href="/">
          <Brand />
        </Link>
        <Link href="/compte">Mon espace</Link>
      </header>
      <section className="panel section-break">
        {profile ? (
          <>
            <div className="profile-heading">
              {profile.avatarUrl ? (
                <Image
                  className="avatar"
                  src={profile.avatarUrl}
                  alt="Photo de profil"
                  width={72}
                  height={72}
                  unoptimized
                />
              ) : (
                <span className="avatar-letter">{profile.displayName[0]}</span>
              )}
              <div>
                <h1>{profile.displayName}</h1>
                <p className="muted">@{profile.username}</p>
              </div>
            </div>
            {profile.isPrivate ? (
              <p>
                Ce profil est privé. Sa biographie et ses liens ne sont pas
                partagés.
              </p>
            ) : (
              <>
                <p>{profile.bio}</p>
                <nav>
                  {profile.links?.map((link) => (
                    <p key={link.url}>
                      <a href={link.url} rel="noopener noreferrer">
                        {link.label}
                      </a>
                    </p>
                  ))}
                </nav>
              </>
            )}
            {!profile.isPrivate && (
              <CreatorConnections username={profile.username} />
            )}
          </>
        ) : (
          <>
            <h1>Profil indisponible</h1>
            <p>
              Ce profil n’existe pas ou le service ne répond pas pour le moment.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
