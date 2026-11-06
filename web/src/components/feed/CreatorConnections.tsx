"use client";
import { useState } from "react";
import { community } from "./api";
export function CreatorConnections({ username }: { username: string }) {
  const [items, setItems] = useState<
      { username: string; displayName: string }[]
    >([]),
    [total, setTotal] = useState<number | null>(null),
    [error, setError] = useState("");
  async function load(kind: string) {
    try {
      const result = await community<{ items: typeof items; total: number }>(
        `/creators/${username}/${kind}`,
      );
      setItems(result.items);
      setTotal(result.total);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="section-break">
      <nav className="actions" aria-label="Vidéos du créateur">
        <a
          className="button secondary"
          href={"/?creator=" + username + "&kind=short"}
        >
          Shorts
        </a>
        <a
          className="button secondary"
          href={"/?creator=" + username + "&kind=long"}
        >
          Vidéos longues
        </a>
      </nav>
      <button className="quiet" onClick={() => void load("followers")}>
        Voir les abonnés
      </button>
      <button className="quiet" onClick={() => void load("following")}>
        Voir les abonnements
      </button>
      {total !== null && (
        <p>{total} profil(s) public(s), jusqu’à 100 affichés.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <ul>
        {items.map((p) => (
          <li key={p.username}>
            <a href={"/profil/" + p.username}>
              {p.displayName} · @{p.username}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
