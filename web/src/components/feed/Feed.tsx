"use client";
import { Icon } from "@/components/Icon";
import { Brand } from "@/components/Brand";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { community, type FeedItem, type FeedPage, type Send } from "./api";
import { FeedCard } from "./FeedCard";
import { HistoryControls } from "./HistoryControls";
export function Feed({ query }: { query: Record<string, string | undefined> }) {
  const [session, setSession] = useState<{
      csrf: string;
      profile: { id: string } | null;
    } | null>(null),
    [sessionReady, setSessionReady] = useState(false);
  const [saver, setSaver] = useState(false),
    [visible, setVisible] = useState(true);
  const [items, setItems] = useState<FeedItem[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [index, setIndex] = useState(-1);
  const root = useRef<HTMLDivElement>(null),
    loadingRef = useRef(false),
    latestIndex = useRef(-1);
  const mode = ["following", "saved"].includes(query.mode || "")
    ? query.mode!
    : "latest";
  const kind = query.kind === "long" ? "long" : "short";
  const panel =
    query.panel === "history" || query.panel === "controls"
      ? query.panel
      : undefined;
  const filters = new URLSearchParams({
    mode,
    kind,
    ...(query.creator ? { creator: query.creator } : {}),
    ...(query.tag ? { tag: query.tag } : {}),
    ...(query.video ? { video: query.video } : {}),
  }).toString();
  const send: Send = useCallback(
    (path, method, body) => community(path, method, body, session?.csrf),
    [session?.csrf],
  );
  useEffect(() => {
    let alive = true;
    fetch("/api/session", { cache: "no-store" })
      .then(async (r) => {
        if (alive && r.ok) setSession(await r.json());
      })
      .catch(() => {})
      .finally(() => {
        if (alive) {
          setSessionReady(true);
          setSaver(
            localStorage.getItem("tala:data-saver") === "true" ||
              (navigator as Navigator & { connection?: { saveData?: boolean } })
                .connection?.saveData === true,
          );
          setVisible(document.visibilityState === "visible");
        }
      });
    const changed = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", changed);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", changed);
    };
  }, []);
  const load = useCallback(
    async (after?: string) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const page = await send<FeedPage>(
          "/feed?" +
            filters +
            (after ? "&cursor=" + encodeURIComponent(after) : ""),
        );
        setItems((old) =>
          after
            ? [
                ...old,
                ...page.items.filter((v) => !old.some((x) => x.id === v.id)),
              ]
            : page.items,
        );
        setCursor(page.nextCursor);
        setError("");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [filters, send],
  );
  useEffect(() => {
    if (!sessionReady || panel) return;
    let alive = true;
    send<FeedPage>("/feed?" + filters)
      .then((page) => {
        if (alive) {
          setItems(page.items);
          setCursor(page.nextCursor);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sessionReady, panel, filters, send]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            const next = Number((entry.target as HTMLElement).dataset.index);
            latestIndex.current = next;
            setIndex(next);
            if (next >= items.length - 2 && cursor && !loading && !error)
              void load(cursor);
          }
      },
      { root: el, threshold: [0, 0.65, 1] },
    );
    el.querySelectorAll("[data-index]").forEach((child) =>
      observer.observe(child),
    );
    return () => observer.disconnect();
  }, [items, cursor, loading, error, load]);
  function navigate(delta: number) {
    root.current
      ?.querySelector(
        `[data-index="${Math.max(0, Math.min(items.length - 1, latestIndex.current + delta))}"]`,
      )
      ?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }
  return (
    <main className="feed-shell">
      {!panel && (
        <a className="skip-link" href="#video-feed">
          Aller au fil vidéo
        </a>
      )}
      <aside className="app-rail">
        <Link className="brand" href="/" aria-label="TALA — Accueil">
          <Brand />
        </Link>
        <nav aria-label="Navigation principale">
          <Link
            href="/"
            aria-current={mode === "latest" && !panel ? "page" : undefined}
          >
            <Icon name="home" />
            <span>Découvrir</span>
          </Link>
          <Link href="/recherche">
            <Icon name="search" />
            <span>Recherche</span>
          </Link>
          <Link className="rail-create" href="/compte?onglet=videos">
            <Icon name="plus" />
            <span>Créer une vidéo</span>
          </Link>
          <Link href="/compte?onglet=messages">
            <Icon name="messages" />
            <span>Messages</span>
          </Link>
          <Link href="/compte">
            <Icon name="user" />
            <span>Mon profil</span>
          </Link>
          <Link
            className="rail-extra"
            href="/?panel=history"
            aria-current={panel === "history" ? "page" : undefined}
          >
            <Icon name="clock" />
            <span>Historique</span>
          </Link>
          <Link
            className="rail-extra"
            href="/?panel=controls"
            aria-current={panel === "controls" ? "page" : undefined}
          >
            <Icon name="settings" />
            <span>Préférences du fil</span>
          </Link>
        </nav>
        <div className="rail-footer">
          <span className="rail-signature">Chaque regard compte.</span>
          {sessionReady && !session ? (
            <>
              <a className="button" href="/auth/login">
                Se connecter
              </a>
              <a className="rail-register" href="/auth/login?inscription=1">
                Créer un compte
              </a>
            </>
          ) : (
            <Link href="/compte?onglet=security">
              Compte et sécurité <span aria-hidden="true">↗</span>
            </Link>
          )}
          <small>TALA · Des histoires, des liens.</small>
        </div>
      </aside>
      <header className="discovery-bar">
        <Link
          className="mobile-feed-brand"
          href="/"
          aria-label="TALA — Accueil"
        >
          <Brand />
        </Link>
        <div>
          <span className="eyebrow">LE MONDE À TRAVERS VOS REGARDS</span>
          <h1>
            {mode === "following"
              ? "Vos créateurs."
              : mode === "saved"
                ? "À garder près de soi."
                : "Un regard. Une histoire."}
          </h1>
        </div>
        <nav className="format-switch" aria-label="Format vidéo">
          <Link
            aria-current={kind === "short" ? "page" : undefined}
            href={"/?kind=short&mode=" + mode}
          >
            <Icon name="play" size={16} /> Shorts
          </Link>
          <Link
            aria-current={kind === "long" ? "page" : undefined}
            href={"/?kind=long&mode=" + mode}
          >
            Vidéos longues
          </Link>
        </nav>
        <details className="feed-preferences">
          <summary aria-label="Options du fil">
            <Icon name="settings" />
          </summary>
          <div>
            {sessionReady && !session && (
              <>
                <a href="/auth/login">Se connecter</a>
                <a href="/auth/login?inscription=1">Créer un compte</a>
              </>
            )}
            <Link href="/?panel=history">Historique de lecture</Link>
            <Link href="/?panel=controls">Préférences du fil</Link>
            <label>
              <input
                type="checkbox"
                checked={saver}
                onChange={(e) => {
                  setSaver(e.target.checked);
                  localStorage.setItem(
                    "tala:data-saver",
                    String(e.target.checked),
                  );
                }}
              />{" "}
              Économie de données
            </label>
          </div>
        </details>
      </header>
      <aside className="feed-context" aria-label="À propos de cette vidéo">
        <span className="eyebrow">DERRIÈRE LE REGARD</span>
        {items[index] ? (
          <>
            <a
              className="context-author"
              href={"/profil/" + items[index].creator.username}
            >
              <span className="context-avatar">
                {items[index].creator.username[0]?.toUpperCase()}
              </span>
              <span>
                @{items[index].creator.username}
                <small>
                  Voir le profil <span aria-hidden="true">↗</span>
                </small>
              </span>
            </a>
            <h2>{items[index].title}</h2>
            <p>{items[index].description}</p>
            <div className="context-tags">
              {items[index].hashtags.map((tag) => (
                <Link key={tag} href={"/?tag=" + encodeURIComponent(tag)}>
                  #{tag}
                </Link>
              ))}
            </div>
            <div className="context-conversation">
              <Icon name="comment" />
              <h3>L’histoire continue ici.</h3>
              <p>
                Ouvrez les commentaires pour réagir, échanger et découvrir
                d’autres regards.
              </p>
            </div>
          </>
        ) : (
          <>
            <h2>La prochaine histoire vous attend.</h2>
            <p>
              Explorez les vidéos et rencontrez les personnes qui les racontent.
            </p>
          </>
        )}
        <Link className="context-create" href="/compte?onglet=videos">
          <Icon name="plus" />
          <span>
            Et si vous racontiez la vôtre ?<small>Publier une vidéo</small>
          </span>
          <span aria-hidden="true">↗</span>
        </Link>
      </aside>
      {query.compte === "supprime" && (
        <p role="status" className="notice">
          Votre compte et votre profil ont été supprimés.
        </p>
      )}
      {query.connexion && (
        <p role="alert">La connexion n’a pas abouti. Réessayez.</p>
      )}
      {(query.tag || query.creator || query.video) && (
        <p className="feed-filter">
          {query.tag
            ? "#" + query.tag
            : query.creator
              ? "@" + query.creator
              : "Reprise de lecture"}{" "}
          <Link href={"/?kind=" + kind}>Voir tout le fil</Link>
          {query.creator && (
            <Link href={"/profil/" + query.creator}>Ouvrir le profil</Link>
          )}
        </p>
      )}
      {panel ? (
        <HistoryControls send={send} mode={panel} />
      ) : (
        <>
          <h1 className="sr-only">
            {kind === "short"
              ? "Le fil des shorts TALA"
              : "Les vidéos longues TALA"}
          </h1>
          <div
            ref={root}
            className="feed-scroll"
            id="video-feed"
            aria-busy={loading}
            role="region"
            aria-label="Fil vidéo"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                navigate(e.key === "ArrowDown" ? 1 : -1);
              }
            }}
          >
            {items.map((item, i) => (
              <div className="feed-slide" data-index={i} key={item.id}>
                <FeedCard
                  item={item}
                  active={index === i && visible}
                  preload={index + 1 === i}
                  saver={saver}
                  send={send}
                  signedIn={!!session?.profile}
                  initialPosition={
                    query.video === item.id
                      ? Math.max(
                          0,
                          Math.min(item.duration, Number(query.position) || 0),
                        )
                      : 0
                  }
                  removed={() => {
                    setItems((old) => old.filter((v) => v.id !== item.id));
                    setIndex(-1);
                  }}
                />
              </div>
            ))}
            {error && (
              <div className="feed-empty" role="alert">
                <h2>Le fil ne peut pas s’ouvrir</h2>
                <p>{error}</p>
                <button onClick={() => void load(cursor || undefined)}>
                  Réessayer
                </button>
                {!session && <a href="/auth/login">Se connecter</a>}
              </div>
            )}
            {!items.length && !error && (
              <div className="feed-empty" role="status">
                {loading && (
                  <div className="feed-skeleton" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                <h2>
                  {loading
                    ? "Ouverture du fil…"
                    : "Les premières histoires arrivent"}
                </h2>
                <p>
                  {loading
                    ? "Nous préparons les vidéos disponibles."
                    : mode === "following"
                      ? "Abonnez-vous à des créateurs publics pour retrouver leurs vidéos ici."
                      : "Aucune vidéo publiée ne correspond à ce fil."}
                </p>
                {!loading && <Link href="/compte">Ouvrir mon espace</Link>}
              </div>
            )}
            {items.length > 0 && !cursor && (
              <p className="feed-end">
                Vous avez vu les vidéos disponibles.{" "}
                <button onClick={() => void load()}>Actualiser le fil</button>
              </p>
            )}
          </div>
          <div className="feed-arrows">
            <button aria-label="Vidéo précédente" onClick={() => navigate(-1)}>
              ↑
            </button>
            <button aria-label="Vidéo suivante" onClick={() => navigate(1)}>
              ↓
            </button>
          </div>
        </>
      )}
    </main>
  );
}
