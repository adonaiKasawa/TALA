"use client";
import { useEffect, useState } from "react";
import { Panel, Empty } from "./Fields";
import type { Send } from "./types";
type Row = { id: string; clientId?: string; expiresAt: string; current?: boolean };
export function SessionLists({ send }: { send: Send }) {
  const [sessions, setSessions] = useState<Row[]>([]),
    [grants, setGrants] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.all([send("/api/identity/sessions"), send("/api/identity/grants")])
      .then(([s, g]) => {
        if (active) {
          setSessions(s as Row[]);
          setGrants(g as Row[]);
        }
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
  }, [send]);
  async function revoke(kind: "sessions" | "grants", row: Row) {
    if (
      !window.confirm(
        kind === "sessions"
          ? "Déconnecter cette session ? Elle peut être celle que vous utilisez."
          : "Retirer cette autorisation ? Vous devrez peut-être vous reconnecter.",
      )
    )
      return;
    try {
      await send(
        `/api/identity/${kind}/${encodeURIComponent(row.id)}`,
        "DELETE",
        {},
      );
      if (kind === "sessions")
        setSessions(sessions.filter((item) => item.id !== row.id));
      else setGrants(grants.filter((item) => item.id !== row.id));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Opération impossible.",
      );
    }
  }
  return (
    <>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <Panel
        title="Sessions ouvertes"
        description="Retirez les connexions que vous ne souhaitez plus conserver."
      >
        {loading ? (
          <p role="status">Chargement…</p>
        ) : sessions.length ? (
          <ul className="row-list">
            {sessions.map((row, index) => (
              <li key={row.id}>
                <div>
                  <strong>{row.current ? "Cette connexion" : `Session ${index + 1}`}</strong>
                  <small>
                    Expire le {new Date(row.expiresAt).toLocaleString("fr")}
                  </small>
                </div>
                <button
                  className="quiet"
                  onClick={() => revoke("sessions", row)}
                >
                  Déconnecter
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Aucune session à afficher.</Empty>
        )}
      </Panel>
      <Panel
        title="Applications autorisées"
        description="Choisissez les applications qui peuvent accéder à votre compte."
      >
        {grants.length ? (
          <ul className="row-list">
            {grants.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.clientId || "Application TALA"}</strong>
                  <small>
                    Expire le {new Date(row.expiresAt).toLocaleDateString("fr")}
                  </small>
                </div>
                <button className="quiet" onClick={() => revoke("grants", row)}>
                  Retirer l’accès
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Aucune autorisation à afficher.</Empty>
        )}
      </Panel>
    </>
  );
}
