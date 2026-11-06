"use client";
import { Icon } from "@/components/Icon";
import { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import type { FeedPlayback } from "./api";

type Props = {
  id: string;
  active: boolean;
  preload: boolean;
  saver: boolean;
  initialPosition?: number;
  onSample: (position: number, playing: boolean) => void;
  onEvent: (event: string) => void;
};
export function FeedPlayer(props: Props) {
  const video = useRef<HTMLVideoElement>(null),
    hls = useRef<Hls | null>(null),
    position = useRef(props.initialPosition || 0);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  const [data, setData] = useState<FeedPlayback | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  const [paused, setPaused] = useState(false),
    [muted, setMuted] = useState(true),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0);
  const userPaused = useRef(paused);
  useEffect(() => {
    userPaused.current = paused;
  }, [paused]);
  const [levels, setLevels] = useState<{ height: number; index: number }[]>([]),
    [quality, setQuality] = useState("-1"),
    [caption, setCaption] = useState("off"),
    [embedded, setEmbedded] = useState<string[]>([]);
  const enabled = props.active || (props.preload && !props.saver);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const r = await fetch("/api/watch/" + props.id, {
        cache: "no-store",
        signal,
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.message || "Vidéo indisponible.");
      return result as FeedPlayback;
    },
    [props.id],
  );
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    load(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [enabled, load]);
  useEffect(() => {
    if (!props.active) return;
    const timer = setInterval(() => {
      void load()
        .then((result) => {
          setData(result);
          setError("");
        })
        .catch((e) => setError(e.message));
    }, 240000);
    return () => clearInterval(timer);
  }, [props.active, load]);
  useEffect(() => {
    const el = video.current;
    if (!el || !data || !enabled) return;
    let disposed = false;
    const start = () => {
      if (latest.current.active && !el.paused) return;
      if (latest.current.active && !userPaused.current)
        void el.play().catch((e) => {
          if (e.name === "NotAllowedError") setPaused(true);
        });
    };
    const ready = () => {
      if (position.current > 0)
        el.currentTime = Math.min(
          position.current,
          Math.max(0, el.duration - 0.1),
        );
      setDuration(el.duration);
      setBusy(false);
      start();
    };
    el.addEventListener("loadedmetadata", ready);
    el.addEventListener("canplay", start);
    if (
      data.type === "hls" &&
      !el.canPlayType("application/vnd.apple.mpegurl")
    ) {
      void import("hls.js")
        .then(({ default: HLS }) => {
          if (disposed) return;
          if (!HLS.isSupported()) {
            setError("Ce navigateur ne permet pas cette lecture.");
            return;
          }
          const player = new HLS({
            enableWorker: false,
            autoStartLoad: latest.current.active,
            maxBufferLength: latest.current.saver ? 5 : 15,
            maxMaxBufferLength: 30,
            backBufferLength: 0,
          });
          hls.current = player;
          player.on(HLS.Events.MANIFEST_PARSED, () => {
            setLevels(
              player.levels.map((v, index) => ({ height: v.height, index })),
            );
            if (latest.current.saver)
              player.autoLevelCapping = Math.max(
                0,
                player.levels.findLastIndex((v) => v.height <= 480),
              );
          });
          player.on(HLS.Events.SUBTITLE_TRACKS_UPDATED, () =>
            setEmbedded(
              player.subtitleTracks.map(
                (t) => t.name || t.lang || "Sous-titres",
              ),
            ),
          );
          player.on(HLS.Events.ERROR, (_, e) => {
            if (e.fatal) setError("Lecture interrompue. Réessayez.");
          });
          player.loadSource(data.url);
          player.attachMedia(el);
        })
        .catch(() => setError("Impossible de préparer le lecteur."));
    } else el.src = data.url;
    return () => {
      disposed = true;
      position.current = el.currentTime;
      el.pause();
      hls.current?.destroy();
      hls.current = null;
      el.removeAttribute("src");
      el.load();
      el.removeEventListener("loadedmetadata", ready);
      el.removeEventListener("canplay", start);
    };
  }, [data, enabled]);
  useEffect(() => {
    const el = video.current;
    if (!el || !data) return;
    if (props.active && !paused) {
      hls.current?.startLoad();
      void el.play().catch((e) => {
        if (e.name === "NotAllowedError") setPaused(true);
      });
    } else {
      el.pause();
      if (!props.active) hls.current?.stopLoad();
    }
  }, [props.active, paused, data]);
  useEffect(() => {
    if (!hls.current) return;
    hls.current.autoLevelCapping = props.saver
      ? Math.max(
          0,
          levels.findLastIndex((v) => v.height <= 480),
        )
      : -1;
    hls.current.currentLevel = props.saver ? -1 : Number(quality);
  }, [props.saver, quality, levels]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    Array.from(el.querySelectorAll("track")).forEach((t, i) => {
      t.track.mode = caption === "external:" + i ? "showing" : "disabled";
    });
    if (hls.current) {
      hls.current.subtitleDisplay = caption.startsWith("embedded:");
      hls.current.subtitleTrack = caption.startsWith("embedded:")
        ? Number(caption.split(":")[1])
        : -1;
    }
  }, [caption, data]);
  const placeCaptions = useCallback(() => {
    const el = video.current;
    if (!el) return;
    for (const track of Array.from(el.querySelectorAll("track"))) {
      for (const cue of Array.from(track.track.cues || []))
        if (cue instanceof VTTCue) {
          cue.snapToLines = false;
          cue.line = Math.max(
            5,
            100 - (160 / Math.max(1, el.clientHeight)) * 100,
          );
        }
    }
  }, []);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const observer = new ResizeObserver(placeCaptions);
    observer.observe(el);
    return () => observer.disconnect();
  }, [placeCaptions]);
  const sample = () => {
    const el = video.current;
    if (!el) return;
    setTime(el.currentTime);
    position.current = el.currentTime;
    props.onSample(
      el.currentTime,
      props.active && !el.paused && !el.seeking && el.readyState >= 3,
    );
  };
  return (
    <div className="feed-player">
      <video
        ref={video}
        crossOrigin="anonymous"
        playsInline
        muted={muted}
        loop
        preload={props.saver ? "none" : props.active ? "auto" : "metadata"}
        poster={data?.thumbnail}
        aria-label="Lecteur vidéo"
        onTimeUpdate={sample}
        onPlaying={() => {
          setBusy(false);
          props.onEvent("play");
        }}
        onWaiting={() => setBusy(true)}
        onPause={() => {
          sample();
          props.onEvent("pause");
        }}
        onSeeked={() => {
          sample();
          props.onEvent("seek");
        }}
        onError={() => {
          if (enabled && data) setError("Lecture interrompue. Réessayez.");
        }}
        onEnded={() => props.onEvent("complete")}
        onLoadedData={() => setBusy(false)}
      >
        {data?.captions.map((t) => (
          <track
            onLoad={placeCaptions}
            key={t.language}
            kind="subtitles"
            src={t.url}
            srcLang={t.language}
            label={t.label}
          />
        ))}
      </video>
      {busy && !error && props.active && (
        <p role="status" className="player-status">
          Préparation de la vidéo…
        </p>
      )}
      {error && (
        <div className="player-status" role="alert">
          <p>{error}</p>
          <button
            onClick={() => {
              setBusy(true);
              void load()
                .then((result) => {
                  setData(result);
                  setError("");
                })
                .catch((e) => setError(e.message));
            }}
          >
            Réessayer la lecture
          </button>
        </div>
      )}
      <div className="player-controls">
        <div className="player-control-row">
          <button
            aria-label={paused ? "Reprendre la vidéo" : "Mettre en pause"}
            onClick={() => setPaused((v) => !v)}
          >
            <Icon name={paused ? "play" : "pause"} />
          </button>
          <button
            aria-label={muted ? "Activer le son" : "Couper le son"}
            aria-pressed={!muted}
            onClick={() => {
              setMuted((v) => !v);
            }}
          >
            <Icon name={muted ? "muted" : "volume"} />
          </button>
          <span>
            {Math.floor(time)} / {Math.floor(duration) || "…"} s
          </span>
        </div>
        <input
          aria-label="Position de lecture"
          type="range"
          min="0"
          max={duration || 1}
          step="0.1"
          value={Math.min(time, duration || 1)}
          onChange={(e) => {
            if (video.current) {
              video.current.currentTime = Number(e.target.value);
              setTime(Number(e.target.value));
            }
          }}
        />
        <details className="playback-settings">
          <summary>
            <Icon name="settings" size={20} />
            <span className="sr-only">Réglages de lecture</span>
          </summary>
          <div className="player-control-row">
            <label>
              Qualité{" "}
              <select
                aria-label="Qualité vidéo"
                value={props.saver ? "-1" : quality}
                onChange={(e) => setQuality(e.target.value)}
                disabled={props.saver || !levels.length}
              >
                <option value="-1">
                  {props.saver
                    ? "Économie · auto"
                    : data?.type === "mp4"
                      ? "Source"
                      : "Automatique"}
                </option>
                {levels.map((l) => (
                  <option key={l.index} value={l.index}>
                    {l.height}p
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sous-titres{" "}
              <select
                aria-label="Sous-titres"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              >
                <option value="off">Désactivés</option>
                {data?.captions.map((t, i) => (
                  <option key={t.language} value={"external:" + i}>
                    {t.label}
                  </option>
                ))}
                {embedded.map((name, i) => (
                  <option key={"hls" + i} value={"embedded:" + i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      </div>
    </div>
  );
}
