"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Send } from "../types";
import type { VideoItem } from "../Videos";
import "./creation.css";
type TextLayer = { text: string; x: number; y: number; color: string };
type Stroke = { points: { x: number; y: number }[]; color: string };
export function CreateVideo({
  csrf,
  send,
  close,
  completed,
}: {
  csrf: string;
  send: Send;
  close: () => void;
  completed: (id: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    stage = useRef<HTMLDivElement>(null),
    player = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    input = useRef<HTMLInputElement>(null),
    media = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    alive = useRef(true),
    abort = useRef<AbortController | null>(null),
    drawing = useRef(false);
  const [step, setStep] = useState<"camera" | "edit" | "publish">("camera"),
    [side, setSide] = useState<"user" | "environment">("environment"),
    [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState(""),
    [recording, setRecording] = useState(false),
    [cameraReady, setCameraReady] = useState(false),
    [error, setError] = useState(""),
    [effect, setEffect] = useState("none"),
    [texts, setTexts] = useState<TextLayer[]>([]),
    [strokes, setStrokes] = useState<Stroke[]>([]),
    [tool, setTool] = useState(""),
    [color, setColor] = useState("#ffffff"),
    [text, setText] = useState(""),
    [duration, setDuration] = useState(0),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [speed, setSpeed] = useState(1),
    [muted, setMuted] = useState(false),
    [cover, setCover] = useState(0),
    [dimensions, setDimensions] = useState({ width: 720, height: 1280 }),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [visibility, setVisibility] = useState("private"),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [uploadId, setUploadId] = useState("");
  const [bounds, setBounds] = useState({ width: 1, height: 1 });
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    px: number;
    py: number;
  } | null>(null);
  useEffect(() => {
    if (step === "publish") return;
    const node = stage.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      setBounds({ width: box.width, height: box.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [step]);
  const ratio =
    step === "camera" ? 9 / 16 : dimensions.width / dimensions.height;
  const frameWidth = Math.min(bounds.width, bounds.height * ratio),
    frameHeight = frameWidth / ratio;
  const stopCamera = useCallback(() => {
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    setCameraReady(false);
  }, []);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    alive.current = true;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      alive.current = false;
      abort.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      media.current?.getTracks().forEach((t) => t.stop());
      document.body.style.overflow = bodyOverflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 6500);
    return () => clearTimeout(timer);
  }, [error]);
  useEffect(() => {
    if (step !== "camera") return;
    let cancelled = false;
    void (async () => {
      try {
        stopCamera();
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: side },
              width: { ideal: 1080 },
              height: { ideal: 1920 },
            },
            audio: true,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: side } },
            audio: false,
          });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        media.current = stream;
        if (player.current) {
          player.current.srcObject = stream;
          await player.current.play();
        }
        setCameraReady(true);
      } catch {
        if (!cancelled)
          setError(
            "Caméra indisponible ou autorisation refusée. La galerie reste accessible.",
          );
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [step, side, stopCamera]);
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );
  function choose(value: File) {
    if (!value.size || value.size > 536870912) {
      setError("Choisissez une vidéo de 512 Mo maximum.");
      return;
    }
    stopCamera();
    if (player.current) player.current.srcObject = null;
    setFile(value);
    setSource(URL.createObjectURL(value));
    setTitle(value.name.replace(/\.[^.]+$/, ""));
    setStart(0);
    setEnd(0);
    setCover(0);
    setDuration(0);
    setUploadId("");
    setStep("edit");
  }
  async function capture() {
    try {
      if (recording) {
        recorder.current?.stop();
        return;
      }
      if (!media.current || typeof MediaRecorder === "undefined")
        throw new Error(
          "Enregistrement non disponible dans ce navigateur. Utilisez la galerie.",
        );
      const mime = [
        "video/mp4",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ].find((v) => MediaRecorder.isTypeSupported(v));
      const current = new MediaRecorder(
          media.current,
          mime ? { mimeType: mime } : undefined,
        ),
        chunks: Blob[] = [];
      recorder.current = current;
      current.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      current.onerror = () => {
        setRecording(false);
        setError("Enregistrement interrompu.");
      };
      const timer = setTimeout(() => {
        if (current.state === "recording") current.stop();
      }, 180000);
      current.onstop = () => {
        clearTimeout(timer);
        setRecording(false);
        if (!alive.current) return;
        const type = current.mimeType;
        choose(
          new File(
            chunks,
            "Mon moment." + (type.includes("mp4") ? "mp4" : "webm"),
            { type },
          ),
        );
      };
      current.start(1000);
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Caméra indisponible.");
    }
  }
  const draw = useCallback(
    (target: HTMLCanvasElement) => {
      const width = dimensions.width,
        height = dimensions.height;
      target.width = width;
      target.height = height;
      const ctx = target.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      if (effect === "warm" || effect === "cool") {
        ctx.fillStyle = effect === "warm" ? "#ffad5533" : "#6d9dff2e";
        ctx.fillRect(0, 0, width, height);
      }
      if (effect === "vignette") {
        const gradient = ctx.createRadialGradient(
          width / 2,
          height / 2,
          Math.min(width, height) * 0.15,
          width / 2,
          height / 2,
          Math.max(width, height) * 0.7,
        );
        gradient.addColorStop(0, "#0000");
        gradient.addColorStop(1, "#000a");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }
      for (const stroke of strokes) {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = width * 0.014;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        stroke.points.forEach((p, i) => {
          if (i) ctx.lineTo(p.x * width, p.y * height);
          else ctx.moveTo(p.x * width, p.y * height);
        });
        ctx.stroke();
      }
      ctx.font = `700 ${Math.round(width * 0.06)}px sans-serif`;
      ctx.textBaseline = "top";
      for (const layer of texts) {
        ctx.fillStyle = layer.color;
        ctx.shadowColor = "#000b";
        ctx.shadowBlur = 3;
        ctx.fillText(
          layer.text,
          layer.x * width,
          layer.y * height,
          width * 0.9,
        );
      }
    },
    [dimensions, effect, strokes, texts],
  );
  useEffect(() => {
    if (canvas.current) draw(canvas.current);
  }, [draw, step]);
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }
  async function publish() {
    if (!file || !duration || busy) return;
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    const signal = abort.current.signal;
    try {
      let item = (await send(
        uploadId ? "/api/videos/" + uploadId : "/api/videos",
        uploadId ? "GET" : "POST",
        uploadId
          ? undefined
          : {
              title: title.trim(),
              description,
              visibility,
              kind: (end - start) / speed <= 180 ? "short" : "long",
              size: file.size,
              thumbnailTime: Math.max(0, (cover - start) / speed),
              editRecipe: {
                start,
                end,
                speed,
                muted,
                overlay:
                  effect !== "none" || texts.length > 0 || strokes.length > 0,
              },
            },
      )) as VideoItem;
      setUploadId(item.id);
      for (let offset = item.uploadedBytes; offset < file.size;) {
        if (signal.aborted) throw new Error("Envoi suspendu.");
        setProgress("Envoi " + Math.round((offset / file.size) * 100) + " %");
        const response = await fetch(`/api/videos/${item.id}/content`, {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            "upload-offset": String(offset),
            "x-csrf-token": csrf,
          },
          body: file.slice(offset, offset + item.chunkBytes),
          signal,
        });
        const value = await response.json();
        if (!response.ok) throw new Error(value.message || "Envoi interrompu.");
        item = value;
        offset = item.uploadedBytes;
      }
      if (effect !== "none" || texts.length || strokes.length) {
        setProgress("Préparation du montage…");
        const art = document.createElement("canvas");
        draw(art);
        const blob = await new Promise<Blob>((resolve, reject) =>
          art.toBlob(
            (value) =>
              value ? resolve(value) : reject(new Error("Export impossible.")),
            "image/png",
          ),
        );
        if (blob.size > 4194304)
          throw new Error("Le montage dépasse 4 Mo. Réduisez les dessins.");
        if (signal.aborted) throw new Error("Envoi suspendu.");
        const response = await fetch(`/api/videos/${item.id}/overlay`, {
          method: "PUT",
          headers: { "content-type": "image/png", "x-csrf-token": csrf },
          body: blob,
          signal,
        });
        if (!response.ok)
          throw new Error(
            (await response.json()).message || "Export interrompu.",
          );
      }
      if (signal.aborted) throw new Error("Envoi suspendu.");
      await send(`/api/videos/${item.id}/complete`, "POST", {});
      if (alive.current) await completed(item.id);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Envoi interrompu.");
    } finally {
      if (alive.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className="creation-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !recording) close();
      }}
      aria-label="Créer une vidéo"
    >
      <header className="creation-header">
        <button
          aria-label="Fermer la création"
          disabled={busy || recording}
          onClick={close}
        >
          ×
        </button>
        <strong>
          {step === "camera"
            ? "Créer"
            : step === "edit"
              ? "Votre montage"
              : "Publier"}
        </strong>
        <span>
          {step !== "camera" && Math.round((end - start) / speed) + " s"}
        </span>
      </header>
      {error && (
        <button
          className="creation-toast"
          role="alert"
          onClick={() => setError("")}
        >
          {error} ×
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const value = e.target.files?.[0];
          if (value) {
            setTexts([]);
            setStrokes([]);
            setEffect("none");
            choose(value);
          }
          e.target.value = "";
        }}
      />
      {step === "publish" ? (
        <form
          className="creation-publication"
          onSubmit={(e) => {
            e.preventDefault();
            void publish();
          }}
        >
          <button
            type="button"
            disabled={busy || !!uploadId}
            onClick={() => setStep("edit")}
          >
            ← Modifier le montage
          </button>
          <h2>Prête à partager.</h2>
          <label>
            Titre
            <input
              required
              maxLength={140}
              value={title}
              disabled={busy || !!uploadId}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Légende
            <textarea
              maxLength={5000}
              value={description}
              disabled={busy || !!uploadId}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Qui peut regarder ?
            <select
              value={visibility}
              disabled={busy || !!uploadId}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="public">Tout le monde</option>
              <option value="private">Moi uniquement</option>
              <option value="unlisted">Par lien</option>
            </select>
          </label>
          <button className="creation-primary" disabled={busy}>
            {busy
              ? progress
              : uploadId
                ? "Reprendre l’envoi"
                : "Envoyer ma vidéo"}
          </button>
          <p>
            Après la préparation, vérifiez votre vidéo puis confirmez sa
            publication.
          </p>
        </form>
      ) : (
        <>
          <div className="creation-stage" ref={stage}>
            <div
              className="creation-frame"
              style={{
                width: frameWidth,
                height: frameHeight,
              }}
            >
              <video
                key={step === "camera" ? "camera" : "clip"}
                ref={player}
                src={step === "edit" ? source : undefined}
                autoPlay
                playsInline
                muted={step === "camera" || muted}
                loop={step === "camera"}
                onDurationChange={(e) => {
                  const v = e.currentTarget;
                  if (
                    step === "edit" &&
                    Number.isFinite(v.duration) &&
                    v.duration >= 0.25
                  ) {
                    setDuration(v.duration);
                    setEnd((old) => old || v.duration);
                    if (v.currentTime > v.duration) {
                      v.currentTime = 0;
                      void v.play().catch(() => {});
                    }
                  }
                }}
                onLoadedMetadata={(e) => {
                  if (step !== "edit") return;
                  const v = e.currentTarget;
                  if (Number.isFinite(v.duration) && v.duration < 0.25) {
                    setError("Cette vidéo ne peut pas être montée.");
                    return;
                  }
                  if (Number.isFinite(v.duration)) {
                    setDuration(v.duration);
                    setEnd((old) => old || v.duration);
                  } else {
                    v.currentTime = 1e10;
                  }
                  const scale = Math.min(
                    1,
                    1920 / Math.max(v.videoWidth, v.videoHeight),
                  );
                  setDimensions({
                    width: Math.max(16, Math.round(v.videoWidth * scale)),
                    height: Math.max(16, Math.round(v.videoHeight * scale)),
                  });
                  v.playbackRate = speed;
                }}
                onTimeUpdate={(e) => {
                  if (
                    step === "edit" &&
                    end &&
                    e.currentTarget.currentTime >= end
                  )
                    e.currentTarget.currentTime = start;
                }}
                onEnded={() => {
                  if (player.current) {
                    player.current.currentTime = start;
                    void player.current.play();
                  }
                }}
                onClick={() => {
                  if (step === "edit" && player.current) {
                    if (player.current.paused) void player.current.play();
                    else player.current.pause();
                  }
                }}
                onError={() => {
                  if (step === "edit")
                    setError(
                      "Ce format ne peut pas être prévisualisé. Essayez un MP4.",
                    );
                }}
              />
              {step === "camera" ? (
                <div className={"camera-effect " + effect} />
              ) : (
                <canvas
                  ref={canvas}
                  className={tool === "draw" ? "drawing" : ""}
                  style={{ pointerEvents: tool === "draw" ? "auto" : "none" }}
                  onPointerDown={(e) => {
                    if (strokes.length >= 40) return;
                    drawing.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setStrokes((old) => [
                      ...old,
                      { color, points: [point(e)] },
                    ]);
                  }}
                  onPointerMove={(e) => {
                    if (drawing.current) {
                      const p = point(e);
                      setStrokes((old) =>
                        old.map((s, i) =>
                          i === old.length - 1 && s.points.length < 300
                            ? { ...s, points: [...s.points, p] }
                            : s,
                        ),
                      );
                    }
                  }}
                  onPointerUp={() => {
                    drawing.current = false;
                  }}
                  onPointerCancel={() => {
                    drawing.current = false;
                  }}
                />
              )}
              {step === "edit" &&
                tool !== "draw" &&
                texts.map((layer, id) => (
                  <button
                    className="creation-text-handle"
                    key={id}
                    aria-label={"Déplacer le texte " + layer.text}
                    style={{
                      left: layer.x * frameWidth,
                      top: layer.y * frameHeight,
                      fontSize: frameWidth * 0.06,
                    }}
                    onKeyDown={(e) => {
                      const delta = {
                        ArrowLeft: [-0.01, 0],
                        ArrowRight: [0.01, 0],
                        ArrowUp: [0, -0.01],
                        ArrowDown: [0, 0.01],
                      }[e.key];
                      if (delta) {
                        e.preventDefault();
                        setTexts((old) =>
                          old.map((t, i) =>
                            i === id
                              ? {
                                  ...t,
                                  x: Math.max(0, Math.min(0.9, t.x + delta[0])),
                                  y: Math.max(0, Math.min(0.9, t.y + delta[1])),
                                }
                              : t,
                          ),
                        );
                      }
                    }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      drag.current = {
                        id,
                        x: layer.x,
                        y: layer.y,
                        px: e.clientX,
                        py: e.clientY,
                      };
                    }}
                    onPointerMove={(e) => {
                      const value = drag.current;
                      if (!value || value.id !== id) return;
                      setTexts((old) =>
                        old.map((t, i) =>
                          i === id
                            ? {
                                ...t,
                                x: Math.max(
                                  0,
                                  Math.min(
                                    0.9,
                                    value.x +
                                      (e.clientX - value.px) / frameWidth,
                                  ),
                                ),
                                y: Math.max(
                                  0,
                                  Math.min(
                                    0.9,
                                    value.y +
                                      (e.clientY - value.py) / frameHeight,
                                  ),
                                ),
                              }
                            : t,
                        ),
                      );
                    }}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                    }}
                  >
                    {layer.text}
                  </button>
                ))}
            </div>
            {step === "edit" && (
              <nav className="creation-tools" aria-label="Outils de montage">
                {[
                  ["text", "Aa", "Texte"],
                  ["stickers", "☺", "Stickers"],
                  ["draw", "✎", "Dessiner"],
                  ["effects", "✦", "Effets"],
                  ["trim", "✂", "Découper"],
                  ["speed", "1×", "Vitesse"],
                  ["cover", "▣", "Couverture"],
                ].map(([id, icon, label]) => (
                  <button
                    key={id}
                    aria-pressed={tool === id}
                    aria-label={label}
                    onClick={() => setTool((v) => (v === id ? "" : id))}
                  >
                    <b>{icon}</b>
                    {label}
                  </button>
                ))}
                <button onClick={() => setMuted((v) => !v)}>
                  {muted ? "Son coupé" : "Son activé"}
                </button>
              </nav>
            )}
            {step === "camera" && (
              <button
                className="camera-flip"
                aria-label="Changer de caméra"
                disabled={recording}
                onClick={() =>
                  setSide((v) => (v === "user" ? "environment" : "user"))
                }
              >
                ↻
              </button>
            )}
            {!!tool && step === "edit" && (
              <section className="creation-panel">
                <button
                  className="panel-close"
                  aria-label="Fermer les outils"
                  onClick={() => setTool("")}
                >
                  ×
                </button>
                {tool === "text" && (
                  <>
                    <label>
                      Votre texte
                      <input
                        maxLength={80}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </label>
                    <input
                      aria-label="Couleur du texte"
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                    />
                    <button
                      disabled={texts.length >= 8 || !text.trim()}
                      onClick={() => {
                        setTexts((old) => [
                          ...old,
                          {
                            text: text.trim(),
                            x: 0.1,
                            y: 0.15 + old.length * 0.08,
                            color,
                          },
                        ]);
                        setText("");
                        setTool("");
                      }}
                    >
                      Ajouter
                    </button>
                    <button onClick={() => setTexts((old) => old.slice(0, -1))}>
                      Retirer le dernier texte
                    </button>
                  </>
                )}
                {tool === "stickers" &&
                  ["❤️", "🔥", "✨", "😂", "👏", "🎉"].map((emoji) => (
                    <button
                      key={emoji}
                      disabled={texts.length >= 8}
                      onClick={() => {
                        setTexts((old) => [
                          ...old,
                          {
                            text: emoji,
                            x: 0.35,
                            y: 0.3 + old.length * 0.08,
                            color: "#ffffff",
                          },
                        ]);
                        setTool("");
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                {tool === "draw" && (
                  <>
                    <label>
                      Couleur
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                      />
                    </label>
                    <button
                      onClick={() => setStrokes((old) => old.slice(0, -1))}
                    >
                      Annuler le trait
                    </button>
                    <button onClick={() => setStrokes([])}>Tout effacer</button>
                  </>
                )}
                {tool === "effects" && (
                  <Effects value={effect} change={setEffect} />
                )}{" "}
                {tool === "speed" &&
                  [0.5, 1, 1.5, 2].map((value) => (
                    <button
                      aria-pressed={speed === value}
                      key={value}
                      onClick={() => {
                        setSpeed(value);
                        if (player.current) player.current.playbackRate = value;
                      }}
                    >
                      {value}×
                    </button>
                  ))}
                {tool === "trim" && (
                  <>
                    <label>
                      Début · {start.toFixed(1)} s
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, end - 0.25)}
                        step={0.1}
                        value={start}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setStart(v);
                          setCover((c) => Math.max(v, c));
                          if (player.current) player.current.currentTime = v;
                        }}
                      />
                    </label>
                    <label>
                      Fin · {end.toFixed(1)} s
                      <input
                        type="range"
                        min={start + 0.25}
                        max={duration}
                        step={0.1}
                        value={end}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setEnd(v);
                          setCover((c) => Math.min(v - 0.05, c));
                        }}
                      />
                    </label>
                  </>
                )}
                {tool === "cover" && (
                  <label>
                    Couverture · {cover.toFixed(1)} s
                    <input
                      type="range"
                      min={start}
                      max={Math.max(start, end - 0.05)}
                      step={0.1}
                      value={cover}
                      onChange={(e) => {
                        setCover(Number(e.target.value));
                        if (player.current) {
                          player.current.pause();
                          player.current.currentTime = Number(e.target.value);
                        }
                      }}
                    />
                  </label>
                )}
              </section>
            )}
          </div>
          <footer className="creation-footer">
            {step === "camera" ? (
              <>
                <Effects
                  value={effect}
                  change={setEffect}
                  disabled={recording}
                />
                <div className="capture-controls">
                  <button
                    aria-label="Ouvrir la galerie"
                    disabled={recording}
                    onClick={() => input.current?.click()}
                  >
                    ▧<small>Galerie</small>
                  </button>
                  <button
                    className="camera-shutter"
                    aria-label={
                      recording
                        ? "Terminer l’enregistrement"
                        : "Enregistrer une vidéo"
                    }
                    disabled={!cameraReady}
                    onClick={() => void capture()}
                  >
                    <span className={recording ? "is-recording" : ""} />
                  </button>
                  <span>3 min</span>
                </div>
              </>
            ) : (
              <>
                <span>Votre regard, votre histoire.</span>
                <button
                  className="creation-primary"
                  disabled={!duration}
                  onClick={() => {
                    player.current?.pause();
                    setTool("");
                    setStep("publish");
                  }}
                >
                  Suivant →
                </button>
              </>
            )}
          </footer>
        </>
      )}
    </dialog>
  );
}
function Effects({
  value,
  change,
  disabled,
}: {
  value: string;
  change: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="creation-effects">
      {[
        ["none", "Normal"],
        ["warm", "Soleil"],
        ["cool", "Azur"],
        ["vignette", "Cinéma"],
      ].map(([id, label]) => (
        <button
          key={id}
          disabled={disabled}
          aria-pressed={value === id}
          onClick={() => change(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
