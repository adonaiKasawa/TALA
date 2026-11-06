"use client";
import { useState } from "react";
import Image from "next/image";
import { Field } from "./Fields";
import type { Profile, Send } from "./types";
export function ProfileForm({
  profile,
  send,
  onSaved,
}: {
  profile: Profile | null;
  send: Send;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const [links, setLinks] = useState(profile?.links || []);
  async function submit(form: FormData) {
    setSaving(true);
    setError("");
    setSaved(false);
    const split = (key: string) =>
      String(form.get(key) || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    try {
      await send("/api/profile", profile ? "PATCH" : "POST", {
        username: form.get("username"),
        displayName: form.get("displayName"),
        bio: form.get("bio"),
        avatarUrl: form.get("avatarUrl") || null,
        links,
        isPrivate: form.get("isPrivate") === "on",
        country: form.get("country") || null,
        languages: split("languages"),
        interests: split("interests"),
        locale: form.get("locale"),
      });
      await onSaved();
      setSaved(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Enregistrement impossible.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={event => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }} className="profile-form">
      <div className="profile-heading">
        {profile?.avatarUrl ? (
          <Image
            className="avatar"
            src={profile.avatarUrl}
            alt="Votre photo de profil"
            width={72}
            height={72}
            unoptimized
          />
        ) : (
          <span className="avatar-letter">
            {(profile?.displayName || "T").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <h2>{profile ? "Votre profil" : "Présentez-vous"}</h2>
          <p className="muted">
            {profile
              ? "Mettez à jour ce que la communauté voit de vous."
              : "Choisissez votre nom pour rejoindre la communauté."}
          </p>
        </div>
      </div>
      <div className="form-grid">
        <Field
          label="Nom affiché"
          name="displayName"
          required
          maxLength={80}
          autoComplete="nickname"
          defaultValue={profile?.displayName}
        />
        <Field
          label="Pseudonyme"
          name="username"
          required
          minLength={3}
          maxLength={30}
          pattern="[a-zA-Z0-9_][a-zA-Z0-9_.]{1,28}[a-zA-Z0-9_]"
          defaultValue={profile?.username}
        />
        <Field
          label="Adresse de votre photo (HTTPS)"
          name="avatarUrl"
          type="url"
          defaultValue={profile?.avatarUrl || ""}
          placeholder="https://…"
        />
        <Field
          label="Pays (code à deux lettres)"
          name="country"
          minLength={2}
          maxLength={2}
          placeholder="CD"
          defaultValue={profile?.preferences.country || ""}
        />
      </div>
      <label className="field">
        Biographie
        <textarea
          name="bio"
          rows={4}
          maxLength={500}
          defaultValue={profile?.bio}
          placeholder="Quelques mots sur vous et vos créations."
        />
      </label>
      <h3>Vos liens</h3>
      {links.map((link, index) => (
        <div className="link-row" key={index}>
          <Field
            label={`Nom du lien ${index + 1}`}
            required
            maxLength={40}
            value={link.label}
            onChange={(event) =>
              setLinks(
                links.map((item, i) =>
                  i === index ? { ...item, label: event.target.value } : item,
                ),
              )
            }
          />
          <Field
            label={`Adresse du lien ${index + 1}`}
            required
            type="url"
            value={link.url}
            onChange={(event) =>
              setLinks(
                links.map((item, i) =>
                  i === index ? { ...item, url: event.target.value } : item,
                ),
              )
            }
          />
          <button
            className="quiet"
            type="button"
            onClick={() => setLinks(links.filter((_, i) => i !== index))}
            aria-label={`Retirer le lien ${index + 1}`}
          >
            Retirer
          </button>
        </div>
      ))}
      {links.length < 5 && (
        <button
          type="button"
          className="button secondary small"
          onClick={() => setLinks([...links, { label: "", url: "" }])}
        >
          Ajouter un lien
        </button>
      )}
      <div className="section-break">
        <h3>Préférences personnelles</h3>
        <p className="muted">
          Ces informations sont visibles uniquement par vous.
        </p>
      </div>
      <div className="form-grid">
        <Field
          label="Langues, séparées par des virgules"
          name="languages"
          placeholder="fr, ln-CD"
          defaultValue={profile?.preferences.languages.join(", ")}
        />
        <Field
          label="Centres d’intérêt, séparés par des virgules"
          name="interests"
          placeholder="Musique, cinéma…"
          defaultValue={profile?.preferences.interests.join(", ")}
        />
        <Field
          label="Langue de l’interface"
          name="locale"
          required
          defaultValue={profile?.preferences.locale || "fr"}
        />
      </div>
      <label className="check">
        <input
          type="checkbox"
          name="isPrivate"
          defaultChecked={profile?.isPrivate}
        />
        <span>
          <strong>Profil privé</strong>
          <small>
            Votre biographie et vos liens seront masqués aux visiteurs.
          </small>
        </span>
      </label>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="notice" role="status">
          Votre profil est enregistré.
        </p>
      )}
      {profile && <p><a href={`/profil/${encodeURIComponent(profile.username)}`}>Voir mon profil public</a></p>}
      <button className="button" disabled={saving}>
        {saving
          ? "Enregistrement…"
          : profile
            ? "Enregistrer les changements"
            : "Créer mon profil"}
      </button>
    </form>
  );
}
