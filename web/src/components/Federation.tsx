"use client";
import { useEffect, useState } from "react";
import { ActionForm } from "./ActionForm";
import { Field, Panel, Empty } from "./Fields";
import type { Send } from "./types";
export function Federation({ send }: { send: Send }) {
  const [providers, setProviders] = useState<{ id: string }[]>([]),
    [linked, setLinked] = useState<{ provider: string }[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/providers").then((response) => response.json()),
      send("/api/identity/identities"),
    ])
      .then(([p, l]) => {
        if (active) {
          setProviders(Array.isArray(p) ? p : []);
          setLinked(l as { provider: string }[]);
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [send]);
  return (
    <Panel
      title="Comptes associés"
      description="Ajoutez un autre moyen de vous connecter, sans partager votre mot de passe TALA."
    >
      {error && <p role="alert">{error}</p>}
      {!providers.length && !linked.length && (
        <Empty>
          Aucun fournisseur de connexion externe n’est disponible pour le
          moment.
        </Empty>
      )}
      {Array.from(new Set([...providers.map((item) => item.id), ...linked.map((item) => item.provider)])).map((id) => {
        const provider = { id };
        const exists = linked.some((item) => item.provider === provider.id);
        return (
          <div className="section-break" key={provider.id}>
            <h3>
              {provider.id === "google"
                ? "Google"
                : provider.id === "apple"
                  ? "Apple"
                  : provider.id}
            </h3>
            <ActionForm
              label={exists ? "Dissocier ce compte" : "Associer ce compte"}
              action={async (form) => {
                const body = {
                  password: form.get("password") || undefined,
                  browser: true,
                };
                const result = (await send(
                  `/api/identity/identities/${provider.id}${exists ? "" : "/link"}`,
                  exists ? "DELETE" : "POST",
                  body,
                )) as { authorizationUrl?: string };
                if (result.authorizationUrl) {
                  const url = new URL(result.authorizationUrl);
                  if (
                    url.protocol !== "https:" &&
                    !["localhost", "127.0.0.1"].includes(url.hostname)
                  )
                    throw new Error("Connexion externe indisponible.");
                  window.location.assign(url);
                } else
                  setLinked(
                    linked.filter((item) => item.provider !== provider.id),
                  );
              }}
            >
              <Field
                label="Mot de passe actuel, si vous en avez un"
                name="password"
                type="password"
                autoComplete="current-password"
              />
            </ActionForm>
          </div>
        );
      })}
    </Panel>
  );
}
