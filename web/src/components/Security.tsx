"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "./ActionForm";
import { Field, Panel } from "./Fields";
import { SessionLists } from "./SessionLists";
import { Federation } from "./Federation";
import type { Identity, Profile, Send } from "./types";
export function Security({
  identity,
  profile,
  send,
  reload,
}: {
  identity: Identity;
  profile: Profile | null;
  send: Send;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(
      null,
    ),
    [receipt, setReceipt] = useState<{
      title: string;
      codes?: string[];
    } | null>(null);
  const password = (
    <Field
      label="Mot de passe actuel, si vous en avez un"
      name="password"
      type="password"
      autoComplete="current-password"
    />
  );
  const code = (
    <Field
      label="Code de vérification ou code de secours"
      name="code"
      required
      autoComplete="one-time-code"
      maxLength={64}
    />
  );
  if (receipt)
    return (
      <Panel
        title={receipt.title}
        description="Vos connexions précédentes ont été fermées. Reconnectez-vous pour continuer."
      >
        {receipt.codes && (
          <>
            <p>
              Conservez ces codes dans un endroit sûr. Chacun ne pourra être
              utilisé qu’une seule fois.
            </p>
            <ul className="recovery-codes">
              {receipt.codes.map((value) => (
                <li key={value}>
                  <code>{value}</code>
                </li>
              ))}
            </ul>
            <button
              className="button secondary"
              onClick={() =>
                navigator.clipboard.writeText(receipt.codes!.join("\n"))
              }
            >
              Copier les codes
            </button>
          </>
        )}
        <p>
          <a className="button" href="/auth/login">
            {receipt.codes
              ? "J’ai conservé mes codes, me reconnecter"
              : "Me reconnecter"}
          </a>
        </p>
      </Panel>
    );
  return (
    <div className="security-stack">
      <Panel
        title="Votre compte"
        description="Votre adresse email est utilisée pour vous connecter et récupérer votre compte."
      >
        <dl className="details">
          <dt>Adresse email</dt>
          <dd>{identity.email}</dd>
          <dt>Vérification</dt>
          <dd>
            {identity.emailVerified
              ? "Adresse vérifiée"
              : "Vérification en attente"}
          </dd>
          <dt>Double vérification</dt>
          <dd>{identity.mfaEnabled ? "Activée" : "Non activée"}</dd>
        </dl>
      </Panel>
      <details className="panel">
        <summary>Mot de passe</summary>
        <Panel
          title="Changer le mot de passe"
          description="Utilisez une phrase longue, propre à votre compte TALA."
        >
          <ActionForm
            label="Enregistrer le nouveau mot de passe"
            action={async (form) => {
              await send("/api/identity/password/change", "POST", {
                currentPassword: form.get("currentPassword") || undefined,
                password: form.get("password"),
              });
              setReceipt({ title: "Votre mot de passe a été changé" });
            }}
          >
            <Field
              label="Mot de passe actuel, si vous en avez un"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
            />
            <Field
              label="Nouveau mot de passe"
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </ActionForm>
        </Panel>
      </details>
      <Panel
        title="Double vérification"
        description="Ajoutez un code temporaire depuis votre application d’authentification."
      >
        {!identity.mfaEnabled ? (
          <>
            <ActionForm
              label="Préparer la double vérification"
              action={async (form) => {
                setSetup(
                  (await send("/api/identity/mfa/enroll", "POST", {
                    password: form.get("password") || undefined,
                  })) as { secret: string; uri: string },
                );
              }}
            >
              {password}
            </ActionForm>
            {setup && (
              <div className="setup">
                <h3>Ajoutez TALA dans votre application</h3>
                <p>
                  Choisissez « Saisir une clé » dans votre application
                  d’authentification, puis utilisez cette clé :
                </p>
                <code className="setup-secret">{setup.secret}</code>
                <p>
                  <a
                    href={setup.uri.startsWith("otpauth://") ? setup.uri : "#"}
                  >
                    Ouvrir mon application d’authentification
                  </a>
                </p>
                <ActionForm
                  label="Activer la double vérification"
                  action={async (form) => {
                    const result = (await send(
                      "/api/identity/mfa/confirm",
                      "POST",
                      { code: form.get("code") },
                    )) as { recoveryCodes: string[] };
                    setSetup(null);
                    setReceipt({
                      title: "Votre double vérification est activée",
                      codes: result.recoveryCodes,
                    });
                  }}
                >
                  {code}
                </ActionForm>
              </div>
            )}
          </>
        ) : (
          <>
            <ActionForm
              label="Créer de nouveaux codes de secours"
              action={async (form) => {
                const result = (await send(
                  "/api/identity/mfa/recovery-codes",
                  "POST",
                  {
                    password: form.get("password") || undefined,
                    code: form.get("code"),
                  },
                )) as { recoveryCodes: string[] };
                setReceipt({
                  title: "Vos nouveaux codes de secours",
                  codes: result.recoveryCodes,
                });
              }}
            >
              {password}
              {code}
            </ActionForm>
            <ActionForm
              danger
              label="Désactiver la double vérification"
              action={async (form) => {
                if (
                  !window.confirm(
                    "Désactiver la double vérification de votre compte ?",
                  )
                )
                  return false;
                await send("/api/identity/mfa/disable", "POST", {
                  password: form.get("password") || undefined,
                  code: form.get("code"),
                });
                setReceipt({
                  title: "Votre double vérification est désactivée",
                });
              }}
            >
              {password}
              {code}
            </ActionForm>
          </>
        )}
      </Panel>
      <SessionLists send={send} />
      <Panel title="Déconnecter tous mes appareils">
        <ActionForm
          danger
          label="Fermer toutes mes sessions"
          action={async () => {
            if (
              !window.confirm(
                "Vous serez aussi déconnecté de cet appareil. Continuer ?",
              )
            )
              return false;
            await send("/api/identity/sessions/revoke-all", "POST", {});
            setReceipt({ title: "Toutes vos sessions ont été fermées" });
          }}
        />
      </Panel>
      <Federation send={send} />
      <Panel
        title="Vos données"
        description="Téléchargez les informations de votre compte et de votre profil."
      >
        <ActionForm
          label="Télécharger mes données"
          action={async () => {
            const identityData = await send("/api/identity/export");
            const blob = new Blob(
              [JSON.stringify({ identity: identityData, profile }, null, 2)],
              { type: "application/json" },
            );
            const url = URL.createObjectURL(blob),
              anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "mes-donnees-tala.json";
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        />
      </Panel>
      <Panel
        title="Supprimer mon profil"
        description="Votre profil et vos vidéos seront supprimés. Votre compte de connexion restera accessible."
      >
        <ActionForm
          danger
          label="Supprimer mon profil"
          action={async () => {
            if (
              !window.confirm(
                "Supprimer définitivement votre profil et toutes vos vidéos ?",
              )
            )
              return false;
            await send("/api/profile", "DELETE");
            await reload();
          }}
        />
      </Panel>
      <Panel
        title="Fermer mon compte"
        description="Cette action supprime votre profil, vos vidéos puis votre compte de connexion. Elle est définitive."
      >
        <ActionForm
          danger
          label="Supprimer mon compte et mon profil"
          action={async (form) => {
            if (
              !window.confirm(
                "Supprimer définitivement votre compte, votre profil et toutes vos vidéos TALA ?",
              )
            )
              return false;
            await send("/api/close-account", "POST", {
              password: form.get("password") || undefined,
            });
            router.replace("/?compte=supprime");
            router.refresh();
          }}
        >
          {password}
        </ActionForm>
      </Panel>
    </div>
  );
}
