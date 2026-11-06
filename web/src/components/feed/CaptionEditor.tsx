"use client";
import { useState } from "react";
import type { Send } from "../types";
export function CaptionEditor({ id, send }: { id: string; send: Send }) {
  const [language, setLanguage] = useState("fr"),
    [label, setLabel] = useState("Français"),
    [content, setContent] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="section-break">
      <summary>Gérer les sous-titres WebVTT</summary>
      <p>
        Trois pistes maximum, 20 Ko par piste. Les sous-titres seront
        disponibles dans le fil.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await send(
              `/api/community/videos/${id}/captions/${language}`,
              "PUT",
              { label, content },
            );
            setNotice("Sous-titres enregistrés.");
          } catch (failure) {
            setNotice((failure as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Code langue
          <input
            required
            pattern="[a-z]{2,3}(-[A-Z]{2})?"
            maxLength={8}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          />
        </label>
        <label className="field">
          Nom de la piste
          <input
            required
            maxLength={60}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label className="field">
          Fichier WebVTT
          <input
            type="file"
            accept=".vtt,text/vtt"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 20000) {
                setNotice("Fichier limité à 20 Ko.");
                return;
              }
              setContent(await file.text());
            }}
          />
        </label>
        <label className="field">
          Contenu WebVTT
          <textarea
            required
            value={content}
            maxLength={20000}
            onChange={(e) => setContent(e.target.value)}
            placeholder={"WEBVTT\n\n00:00.000 --> 00:02.000\nBonjour TALA"}
          />
        </label>
        <button className="button" disabled={busy}>
          Enregistrer les sous-titres
        </button>
        <button
          type="button"
          className="quiet"
          disabled={busy}
          onClick={() => {
            if (confirm("Supprimer la piste de cette langue ?"))
              void send(
                `/api/community/videos/${id}/captions/${language}`,
                "DELETE",
              )
                .then(() => setNotice("Piste supprimée."))
                .catch((e) => setNotice(e.message));
          }}
        >
          Supprimer cette piste
        </button>
      </form>
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
