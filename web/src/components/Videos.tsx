"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionForm } from "./ActionForm";
import { Field, Panel } from "./Fields";
import { VideoPlayer, type Playback } from "./VideoPlayer";
import type { Send } from "./types";
import { CaptionEditor } from "./feed/CaptionEditor";
import { CreateVideo } from "./creation/CreateVideo";
export type VideoItem = {
  id: string;
  title: string;
  description: string;
  visibility: "private" | "unlisted" | "public";
  kind: "short" | "long";
  status: string;
  size: number;
  uploadedBytes: number;
  duration: number | null;
  thumbnailTime: number;
  driver: string;
  isTest: boolean;
  errorCode: string | null;
  chunkBytes: number;
};
const labels: Record<string, string> = {
  draft: "À envoyer",
  uploading: "Envoi en cours",
  queued: "En attente de traitement",
  analyzing: "Vérification du fichier",
  optimizing: "Préparation de la vidéo",
  transferring: "Transfert vers Mux",
  mux_processing: "Encodage chez Mux",
  ready: "Prête à publier",
  published: "Publiée",
  failed: "Traitement interrompu",
  rejected: "Fichier refusé",
};
const reasons: Record<string, string> = {
  MEDIA_DURATION_LIMIT: "La durée dépasse la limite de ce format.",
  MEDIA_INVALID: "Le fichier est illisible ou incomplet.",
  MEDIA_CONTAINER_UNSUPPORTED: "Choisissez une vidéo MP4, MOV ou WebM.",
  MEDIA_DIMENSIONS_LIMIT: "Résolution ou cadence non prise en charge.",
  MEDIA_HDR_REQUIRES_MUX: "Le traitement HDR nécessite le mode Mux.",
  MEDIA_QUALITY_CHECK_FAILED: "Le contrôle qualité a refusé la conversion.",
  MEDIA_TRACKS_UNSUPPORTED:
    "Les vidéos avec plusieurs pistes audio ou des sous-titres intégrés nécessitent un traitement spécifique.",
  MEDIA_THUMBNAIL_RANGE: "La position de miniature dépasse la durée.",
  MUX_RECONCILIATION_REQUIRED:
    "La création chez Mux est à vérifier avant une nouvelle tentative.",
};
export function Videos({ send, csrf }: { send: Send; csrf: string }) {
  const [creating, setCreating] = useState(true);
  const [items, setItems] = useState<VideoItem[]>([]),
    [error, setError] = useState(""),
    [active, setActive] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const data = await send("/api/videos");
    setItems(data as VideoItem[]);
    setLoaded(true);
  }, [send]);
  useEffect(() => {
    let stopped = false;
    const refresh = () =>
      load().catch((error) => {
        if (!stopped) {
          setError(error.message);
          setLoaded(true);
        }
      });
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [load]);
  const selected = items.find((v) => v.id === active);
  return (
    <div className="security-stack">
      <Panel
        title="Mes vidéos"
        description="Importez un short ou une vidéo longue, vérifiez le résultat, puis choisissez quand publier."
      >
        <p>
          Import privé, traitement en arrière-plan et publication explicite.
          Shorts : 3 minutes maximum.
        </p>
        <button className="button" onClick={() => setCreating(true)}>
          Créer une vidéo
        </button>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!loaded ? (
          <p role="status">Chargement…</p>
        ) : !items.length ? (
          <p className="empty">Vous n’avez pas encore importé de vidéo.</p>
        ) : (
          <ul className="row-list">
            {items.map((v) => (
              <li key={v.id}>
                <div>
                  <strong>{v.title}</strong>
                  <small>
                    {labels[v.status] || v.status} ·{" "}
                    {v.kind === "short" ? "Short" : "Vidéo longue"}
                  </small>
                </div>
                <button className="quiet" onClick={() => setActive(v.id)}>
                  Ouvrir
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {selected && (
        <VideoEditor
          key={selected.id}
          video={selected}
          send={send}
          csrf={csrf}
          reload={load}
          selected={(id) => {
            setActive(id);
          }}
        />
      )}
      {creating && (
        <CreateVideo
          csrf={csrf}
          send={send}
          close={() => setCreating(false)}
          completed={async (id) => {
            await load();
            setActive(id);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
function VideoEditor({
  video,
  send,
  csrf,
  reload,
  selected,
}: {
  video?: VideoItem;
  send: Send;
  csrf: string;
  reload: () => Promise<void>;
  selected: (id: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [uploadId, setUploadId] = useState<string | null>(video?.id || null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [playback, setPlayback] = useState<Playback | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const refresh = useCallback(
    async () =>
      setPlayback(
        (await send(`/api/videos/${video!.id}/playback`)) as Playback,
      ),
    [send, video],
  );
  async function upload(form: FormData) {
    if (!file) throw new Error("Choisissez une vidéo.");
    if (file.size > 536870912)
      throw new Error("Le fichier doit faire au maximum 512 Mo.");
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    try {
      let item = uploadId
        ? ((await send("/api/videos/" + uploadId)) as VideoItem)
        : ((await send("/api/videos", "POST", {
            title: form.get("title"),
            description: form.get("description"),
            visibility: form.get("visibility"),
            kind: form.get("kind"),
            thumbnailTime: Number(form.get("thumbnailTime") || 0),
            size: file.size,
          })) as VideoItem);
      setUploadId(item.id);
      if (item.size !== file.size)
        throw new Error("Choisissez le fichier correspondant à cet import.");
      for (let offset = item.uploadedBytes; offset < file.size;) {
        const end = Math.min(offset + item.chunkBytes, file.size),
          response = await fetch(`/api/videos/${item.id}/content`, {
            method: "PUT",
            headers: {
              "content-type": "application/octet-stream",
              "upload-offset": String(offset),
              "x-csrf-token": csrf,
            },
            body: file.slice(offset, end),
            signal: abort.current.signal,
          });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Envoi interrompu.");
        item = data;
        offset = item.uploadedBytes;
        setProgress(Math.floor((offset / file.size) * 100));
      }
      await send(`/api/videos/${item.id}/complete`, "POST", {});
      await reload();
      selected(item.id);
    } catch (error) {
      setError(
        error instanceof Error && error.name === "AbortError"
          ? "Envoi suspendu. Vous pouvez reprendre avec le même fichier."
          : error instanceof Error
            ? error.message
            : "Envoi interrompu.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const metadata = (
    <>
      <Field
        label="Titre"
        name="title"
        required
        maxLength={140}
        defaultValue={video?.title}
      />
      <label className="field">
        Description
        <textarea
          name="description"
          maxLength={5000}
          defaultValue={video?.description}
        />
      </label>
      <div className="form-grid">
        <label className="field">
          Format
          <select name="kind" defaultValue={video?.kind || "short"}>
            <option value="short">Short — 3 minutes maximum</option>
            <option value="long">Vidéo longue — 1 heure maximum</option>
          </select>
        </label>
        <label className="field">
          Visibilité
          <select
            name="visibility"
            defaultValue={video?.visibility || "private"}
          >
            <option value="private">Privée — vous uniquement</option>
            <option value="unlisted">
              Non répertoriée — personnes ayant le lien
            </option>
            <option value="public">Publique</option>
          </select>
        </label>
        <Field
          label="Position de la miniature (secondes)"
          name="thumbnailTime"
          type="number"
          min="0"
          step="0.1"
          defaultValue={video?.thumbnailTime || 0}
        />
      </div>
    </>
  );
  const uploadable = !video || ["draft", "uploading"].includes(video.status);
  return (
    <Panel
      title={video ? video.title : "Nouvel import"}
      description={
        video ? labels[video.status] : "MP4, MOV ou WebM · 512 Mo maximum"
      }
    >
      {video?.driver === "local" && (
        <p className="notice">
          Mode local de développement : la vidéo est conservée sur ce poste.
        </p>
      )}
      {video?.isTest && (
        <p className="notice">
          Mux en mode test : la lecture peut être limitée à un extrait et
          l’asset expire chez Mux.
        </p>
      )}
      {video?.errorCode && (
        <p className="notice error" role="alert">
          {reasons[video.errorCode] ||
            "Le traitement n’a pas abouti. Vérifiez le fichier puis réessayez."}
        </p>
      )}
      {uploadable ? (
        <ActionForm
          label={
            busy
              ? "Envoi…"
              : uploadId
                ? "Reprendre l’envoi"
                : "Envoyer la vidéo"
          }
          action={upload}
        >
          {!video && metadata}
          <Field
            label="Fichier vidéo"
            name="file"
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <p className="muted">
            Gardez cette page ouverte pendant l’envoi. Le traitement continue
            ensuite en arrière-plan.
          </p>
          {busy && (
            <>
              <progress max="100" value={progress} />
              <p role="status">{progress} % envoyés</p>
              <button
                type="button"
                className="quiet"
                onClick={() => abort.current?.abort()}
              >
                Suspendre l’envoi
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </ActionForm>
      ) : (
        <ActionForm
          label="Enregistrer les informations"
          action={async (form) => {
            await send("/api/videos/" + video!.id, "PATCH", {
              title: form.get("title"),
              description: form.get("description"),
              visibility: form.get("visibility"),
              kind: form.get("kind"),
              thumbnailTime: Number(form.get("thumbnailTime") || 0),
            });
            await reload();
          }}
        >
          {metadata}
        </ActionForm>
      )}
      {video && (
        <div className="section-break">
          <CaptionEditor id={video.id} send={send} />
          {["ready", "published"].includes(video.status) && (
            <>
              <ActionForm
                label="Voir la vidéo"
                action={async () => {
                  await refresh();
                }}
              />
              {playback && (
                <VideoPlayer
                  playback={playback}
                  refresh={() =>
                    void refresh().catch((error) => setError(error.message))
                  }
                />
              )}
              <ActionForm
                label={
                  video.status === "published"
                    ? "Retirer de la publication"
                    : "Publier la vidéo"
                }
                action={async () => {
                  await send(
                    `/api/videos/${video.id}/${video.status === "published" ? "unpublish" : "publish"}`,
                    "POST",
                    {},
                  );
                  await reload();
                }}
              />
              {video.status === "published" &&
                video.visibility !== "private" && (
                  <p>
                    <a href={"/regarder/" + video.id}>
                      Ouvrir le lien de lecture
                    </a>
                  </p>
                )}
            </>
          )}
          {video.status === "failed" && (
            <ActionForm
              label="Réessayer le traitement"
              action={async () => {
                await send(`/api/videos/${video.id}/retry`, "POST", {});
                await reload();
              }}
            />
          )}
          <ActionForm
            label="Supprimer la vidéo"
            danger
            action={async () => {
              if (!confirm("Supprimer cette vidéo et arrêter sa lecture ?"))
                return false;
              await send("/api/videos/" + video.id, "DELETE");
              await reload();
              selected("");
            }}
          />
        </div>
      )}
    </Panel>
  );
}
