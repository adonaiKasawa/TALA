"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ProfileForm } from "./ProfileForm";
import type { Profile, Send } from "./types";
import "./space.css";
type Item = { id: string; title: string; views?: number };
export function WebVideoGrid({ items, send }: { items: Item[]; send: Send }) {
  const [visible, setVisible] = useState(12);
  return (
    <>
      <div className="profile-video-grid">
        {items.slice(0, visible).map((item) => (
          <WebTile key={item.id} item={item} send={send} />
        ))}
      </div>
      {items.length > visible && (
        <button className="quiet" onClick={() => setVisible((v) => v + 12)}>
          Afficher plus de vidéos
        </button>
      )}
    </>
  );
}
function WebTile({ item, send }: { item: Item; send: Send }) {
  const [thumbnail, setThumbnail] = useState("");
  useEffect(() => {
    let alive = true;
    send(`/api/watch/${item.id}`)
      .then((value) => {
        if (alive) setThumbnail((value as { thumbnail: string }).thumbnail);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [send, item.id]);
  return (
    <Link
      href={"/regarder/" + item.id}
      className="profile-video-tile"
      aria-label={item.title}
    >
      {thumbnail && (
        <Image src={thumbnail} alt="" unoptimized width={400} height={600} />
      )}
      <span>▷ {(item.views || 0).toLocaleString("fr-FR")}</span>
      <small>{item.title}</small>
    </Link>
  );
}
type Library = {
  items: Item[];
  stats: {
    videos: number;
    reposts: number;
    favorites: number;
    followers: number;
    following: number;
  };
};
export function ProfileHome({
  profile,
  send,
  reload,
  account,
}: {
  profile: Profile | null;
  send: Send;
  reload: () => Promise<void>;
  account: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [tab, setTab] = useState("videos"),
    [data, setData] = useState<Library | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    if (profile)
      send("/api/community/me/library?tab=" + tab)
        .then((value) => {
          if (alive) {
            setData(value as Library);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [profile, send, tab]);
  if (!profile || editing)
    return (
      <section className="panel">
        {profile && (
          <button className="quiet" onClick={() => setEditing(false)}>
            ← Mon profil
          </button>
        )}
        <ProfileForm
          profile={profile}
          send={send}
          onSaved={async () => {
            await reload();
            setEditing(false);
          }}
        />
      </section>
    );
  return (
    <section className="profile-home">
      <header>
        <h2>@{profile.username}</h2>
        <button className="quiet" onClick={account}>
          Compte ⚙
        </button>
      </header>
      <div className="profile-identity">
        {profile.avatarUrl ? (
          <Image
            src={profile.avatarUrl}
            alt="Votre photo de profil"
            unoptimized
            width={96}
            height={96}
          />
        ) : (
          <span className="profile-initial">{profile.displayName[0]}</span>
        )}
        <h3>{profile.displayName}</h3>
        <p>{profile.bio}</p>
        <div className="profile-stats">
          <span>
            <strong>{data?.stats.following ?? "—"}</strong>Abonnements
          </span>
          <span>
            <strong>{data?.stats.followers ?? "—"}</strong>Abonnés
          </span>
          <span>
            <strong>{data?.stats.reposts ?? "—"}</strong>Republications
          </span>
        </div>
        <button className="button secondary" onClick={() => setEditing(true)}>
          Modifier le profil
        </button>
      </div>
      <nav className="profile-tabs" aria-label="Contenu du profil">
        {[
          ["videos", "Vidéos"],
          ["reposts", "Republications"],
          ["favorites", "Favoris"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setData(null);
              setTab(id);
            }}
          >
            {label}{" "}
            {data && tab === id ? data.stats[id as keyof Library["stats"]] : ""}
          </button>
        ))}
      </nav>
      {tab === "favorites" && (
        <p className="muted">Vos favoris restent privés.</p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {data ? (
        <>
          <WebVideoGrid items={data.items} send={send} />
          {!data.items.length && (
            <p className="empty">
              Vos{" "}
              {tab === "videos"
                ? "vidéos"
                : tab === "reposts"
                  ? "republications"
                  : "favoris"}{" "}
              apparaîtront ici.
            </p>
          )}
          <small className="muted">Vues enregistrées par TALA.</small>
        </>
      ) : (
        <p role="status">Chargement…</p>
      )}
    </section>
  );
}
export function WebSearch() {
  const [query, setQuery] = useState(""),
    [data, setData] = useState<{
      videos: Item[];
      creators: { username: string; displayName: string }[];
      hashtags: string[];
    } | null>(null),
    [error, setError] = useState("");
  const send = useCallback(async (url: string) => {
    const response = await fetch(url, { cache: "no-store" });
    const value = await response.json();
    if (!response.ok)
      throw new Error(value.message || "Recherche indisponible.");
    return value;
  }, []);
  useEffect(() => {
    let alive = true;
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => {
      void send("/api/community/search?q=" + encodeURIComponent(query.trim()))
        .then((value) => {
          if (alive) {
            setData(value);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [send, query]);
  return (
    <section className="profile-home">
      <h1>Rechercher</h1>
      <label className="field">
        Créateurs, vidéos et hashtags
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setData(null);
            setQuery(e.target.value);
          }}
          placeholder="Un créateur, une découverte…"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <h2>Créateurs</h2>
          {data.creators.map((p) => (
            <Link
              key={p.username}
              className="space-person"
              href={"/?creator=" + encodeURIComponent(p.username)}
            >
              <strong>{p.displayName}</strong>
              <small>@{p.username}</small>
            </Link>
          ))}
          <p>{data.hashtags.map((t) => "#" + t).join("  ")}</p>
          <h2>Vidéos</h2>
          <WebVideoGrid items={data.videos} send={send} />
          {!data.videos.length && !data.creators.length && (
            <p className="empty">Aucun résultat.</p>
          )}
        </>
      )}
    </section>
  );
}
type Message = {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
};
type Thread = {
  id: string;
  peer: { displayName: string; username: string };
  last: Message | null;
  unread: number;
};
type Page = {
  me: string;
  peer: Thread["peer"];
  items: Message[];
  nextCursor: string | null;
};
export function WebMessages({ send }: { send: Send }) {
  const [threads, setThreads] = useState<Thread[]>([]),
    [selected, setSelected] = useState(""),
    [page, setPage] = useState<Page | null>(null),
    [username, setUsername] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  const pending = useRef<{ clientId: string; text: string } | null>(null);
  const active = useRef(selected),
    olderLoaded = useRef(false);
  function openThread(id: string) {
    active.current = id;
    setPage(null);
    setText("");
    pending.current = null;
    olderLoaded.current = false;
    setSelected(id);
  }
  const load = useCallback(async () => {
    if (selected) {
      const value = (await send(
        `/api/community/conversations/${selected}/messages`,
      )) as Page;
      if (active.current !== selected) return;
      setPage((current) =>
        current && olderLoaded.current
          ? {
              ...value,
              nextCursor: current.nextCursor,
              items: [
                ...current.items.filter(
                  (old) => !value.items.some((v) => v.id === old.id),
                ),
                ...value.items,
              ],
            }
          : value,
      );
      await send(`/api/community/conversations/${selected}/read`, "PUT");
    } else
      setThreads(
        ((await send("/api/community/me/conversations")) as { items: Thread[] })
          .items,
      );
  }, [send, selected]);
  useEffect(() => {
    const initial = setTimeout(
      () => void load().catch((e) => setError(e.message)),
      0,
    );
    const timer = setInterval(
      () => void load().catch((e) => setError(e.message)),
      5000,
    );
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);
  async function open(e: React.FormEvent) {
    e.preventDefault();
    try {
      const row = (await send("/api/community/me/conversations", "POST", {
        username: username.trim().replace(/^@/, ""),
      })) as { id: string };
      openThread(row.id);
      setUsername("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function write(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const data =
        pending.current?.text === text.trim()
          ? pending.current
          : { text: text.trim(), clientId: crypto.randomUUID() };
      pending.current = data;
      await send(
        `/api/community/conversations/${selected}/messages`,
        "POST",
        data,
      );
      pending.current = null;
      setText("");
      setError("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="space-messages">
      <header>
        {selected && (
          <button className="quiet" onClick={() => openThread("")}>
            ← Retour
          </button>
        )}
        <h2>{page?.peer.displayName || "Messages"}</h2>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {selected ? (
        <>
          {page?.nextCursor && (
            <button
              className="quiet"
              onClick={() =>
                void send(
                  `/api/community/conversations/${selected}/messages?before=${page.nextCursor}`,
                )
                  .then((value) => {
                    const older = value as Page;
                    if (active.current !== selected) return;
                    olderLoaded.current = true;
                    setPage((current) =>
                      current
                        ? {
                            ...current,
                            items: [...older.items, ...current.items],
                            nextCursor: older.nextCursor,
                          }
                        : current,
                    );
                  })
                  .catch((e) => setError(e.message))
              }
            >
              Messages précédents
            </button>
          )}
          <div className="space-chat">
            {page?.items.map((m) => (
              <div
                key={m.id}
                className={
                  "space-bubble " + (m.senderId === page.me ? "own" : "")
                }
              >
                <p>{m.text}</p>
                <small>
                  {new Date(m.createdAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </div>
            ))}
            {page && !page.items.length && (
              <p className="empty">Commencez la conversation.</p>
            )}
          </div>
          <form onSubmit={write} className="space-write">
            <textarea
              aria-label="Votre message"
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Votre message…"
            />
            <button className="button" disabled={sending || !text.trim()}>
              Envoyer
            </button>
          </form>
        </>
      ) : (
        <>
          <form onSubmit={open} className="space-write">
            <input
              aria-label="Pseudonyme du destinataire"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Écrire à @pseudonyme"
            />
            <button className="button">Ouvrir</button>
          </form>
          {threads.map((t) => (
            <button
              className="space-person"
              key={t.id}
              onClick={() => openThread(t.id)}
            >
              <strong>
                {t.peer.displayName}
                {t.unread > 0 ? " · " + t.unread + " non lu(s)" : ""}
              </strong>
              <small>{t.last?.text || "Nouvelle conversation"}</small>
            </button>
          ))}
          {!threads.length && (
            <p className="empty">Vos conversations privées apparaîtront ici.</p>
          )}
        </>
      )}
    </section>
  );
}
