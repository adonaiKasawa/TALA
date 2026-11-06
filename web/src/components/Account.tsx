"use client";
import { Brand } from "@/components/Brand";
import { Icon } from "@/components/Icon";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ProfileHome, WebMessages, WebSearch } from "./Space";
import { Security } from "./Security";
import { Videos } from "./Videos";
import type { SessionView } from "./types";
async function fetchSession(): Promise<SessionView> {
  const response = await fetch("/api/session", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Connexion impossible.");
  return data;
}
export function Account({ initialTab = "profile" }: { initialTab?: string }) {
  const [session, setSession] = useState<SessionView | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tab, setTab] = useState(initialTab);
  const load = useCallback(async () => {
    setSession(await fetchSession());
    setError("");
  }, []);
  useEffect(() => {
    let active = true;
    fetchSession()
      .then((data) => {
        if (active) setSession(data);
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const send = useCallback(
    async (url: string, method = "GET", body?: unknown): Promise<unknown> => {
      const response = await fetch(url, {
        method,
        headers: {
          "x-csrf-token": session?.csrf || "",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.errors?.length
            ? `${data.message} ${data.errors.map((field: { field: string; message: string }) => `${field.field} : ${field.message}`).join(" ")}`
            : data.message || "Cette action n’a pas abouti.",
        );
      return data;
    },
    [session?.csrf],
  );
  async function logout() {
    try {
      const result = (await send("/auth/logout", "POST")) as {
        redirect: string;
      };
      window.location.assign(result.redirect);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Déconnexion impossible.",
      );
    }
  }
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <Brand />
        </Link>
        <nav aria-label="Mon espace">
          <Link className="account-home" href="/">
            <Icon name="home" />
            <span>Découvrir</span>
          </Link>
          <Link href="/recherche">
            <Icon name="search" />
            <span>Recherche</span>
          </Link>
          <button
            onClick={() => setTab("videos")}
            aria-current={tab === "videos" ? "page" : undefined}
          >
            <Icon name="plus" />
            <span>Créer une vidéo</span>
          </button>
          <button
            onClick={() => setTab("messages")}
            aria-current={tab === "messages" ? "page" : undefined}
          >
            <Icon name="messages" />
            <span>Messages</span>
          </button>
          <button
            onClick={() => setTab("profile")}
            aria-current={tab === "profile" ? "page" : undefined}
          >
            <Icon name="user" />
            <span>Mon profil</span>
          </button>
        </nav>
        <p className="sidebar-note">
          Prenez votre place.
          <br />
          Gardez le contrôle.
        </p>
        {session && (
          <button className="quiet" onClick={logout}>
            Se déconnecter
          </button>
        )}
      </aside>
      <main className="workspace-main">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">VOTRE REGARD, VOTRE ESPACE</p>
            <h1>
              {tab === "videos"
                ? "Mes vidéos"
                : tab === "profile"
                  ? "Bonjour, " + (session?.profile?.displayName || "bienvenue")
                  : tab === "messages"
                    ? "Messages"
                    : "Paramètres du compte"}
            </h1>
          </div>
          {session && (
            <span className="account-chip">{session.identity.email}</span>
          )}
        </header>
        {loading ? (
          <div className="loading" role="status">
            Ouverture de votre espace…
          </div>
        ) : !session ? (
          <section className="panel">
            <h2>Retrouvons votre espace</h2>
            <p role="alert">{error || "Connectez-vous pour continuer."}</p>
            <a className="button" href="/auth/login">
              Se connecter
            </a>
          </section>
        ) : (
          <>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            {tab === "videos" ? (
              <Videos send={send} csrf={session.csrf} />
            ) : tab === "messages" ? (
              <WebMessages send={send} />
            ) : tab === "search" ? (
              <WebSearch />
            ) : tab === "profile" ? (
              <ProfileHome
                key={session.profile?.id || "new"}
                profile={session.profile}
                send={send}
                reload={load}
                account={() => setTab("security")}
              />
            ) : (
              <Security
                identity={session.identity}
                profile={session.profile}
                send={send}
                reload={load}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
