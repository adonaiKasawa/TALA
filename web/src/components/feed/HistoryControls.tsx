"use client";
import { useEffect, useState } from "react";
import type { Send } from "./api";
export function HistoryControls({
  send,
  mode,
}: {
  send: Send;
  mode: "history" | "controls";
}) {
  const [items, setItems] = useState<
      {
        videoId?: string;
        title?: string;
        kind: string;
        positionMs?: number;
        username?: string;
        displayName?: string;
      }[]
    >([]),
    [error, setError] = useState("");
  const path = mode === "history" ? "/me/history" : "/me/creator-controls";
  async function load() {
    try {
      const result = await send<{ items: typeof items }>(path);
      setItems(result.items);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let alive = true;
    send<{ items: typeof items }>(path)
      .then((r) => {
        if (alive) setItems(r.items);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [path, send]);
  return (
    <section className="feed-library">
      <h1>
        {mode === "history" ? "Votre historique" : "Vos contrôles de créateurs"}
      </h1>
      <p>
        {mode === "history"
          ? "Vos dernières vidéos, avec votre position de lecture. Conservation : 90 jours."
          : "Retirez un blocage, une mise en sourdine ou une restriction."}
      </p>
      {error && (
        <p role="alert">
          {error} <a href="/auth/login">Se connecter</a>
        </p>
      )}
      {!items.length && <p>Aucun élément à afficher.</p>}
      <ul>
        {items.map((item, i) => (
          <li key={item.videoId || item.username! + i}>
            {mode === "history" ? (
              <a
                href={`/?video=${item.videoId}&kind=${item.kind}&position=${(item.positionMs || 0) / 1000}`}
              >
                {item.title} — Reprendre à{" "}
                {Math.floor((item.positionMs || 0) / 1000)} s
              </a>
            ) : (
              <>
                <span>
                  @{item.username} ·{" "}
                  {
                    (
                      {
                        block: "Bloqué",
                        mute: "Masqué",
                        restrict: "Restreint",
                        not_interested: "Pas intéressé — " + item.title,
                      } as Record<string, string>
                    )[item.kind]
                  }
                </span>
                <button
                  onClick={() =>
                    void send(
                      item.kind === "not_interested"
                        ? `/videos/${item.videoId}/reactions/not_interested`
                        : `/creators/${item.username}/relations/${item.kind}`,
                      "DELETE",
                    )
                      .then(load)
                      .catch((e) => setError(e.message))
                  }
                >
                  Retirer ce contrôle
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {mode === "history" && items.length > 0 && (
        <button
          onClick={() => {
            if (confirm("Effacer votre historique de visionnage ?"))
              void send("/me/history", "DELETE")
                .then(load)
                .catch((e) => setError(e.message));
          }}
        >
          Effacer l’historique
        </button>
      )}
      {error && <button onClick={() => void load()}>Réessayer</button>}
    </section>
  );
}
