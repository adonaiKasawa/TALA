"use client";
import { useEffect, useRef, useState } from "react";
import type { FeedItem, Send } from "./api";
import { FeedPlayer } from "./FeedPlayer";
import { SocialActions } from "./SocialActions";
import { WatchTracker } from "./watch-tracker";
export function FeedCard({
  item,
  active,
  preload,
  saver,
  send,
  signedIn,
  initialPosition,
  removed,
}: {
  item: FeedItem;
  active: boolean;
  preload: boolean;
  saver: boolean;
  send: Send;
  signedIn: boolean;
  initialPosition?: number;
  removed: () => void;
}) {
  const tracker = useRef<WatchTracker | null>(null),
    position = useRef(initialPosition || 0),
    previous = useRef(0);
  const [audio, setAudio] = useState(false),
    [panel, setPanel] = useState(false);
  useEffect(() => {
    if (!active || !signedIn) return;
    let alive = true;
    const id = crypto.randomUUID();
    let session: WatchTracker | undefined;
    void send("/watch/impressions", "POST", {
      id,
      videoId: item.id,
      surface: item.kind,
    })
      .then(() => {
        if (!alive) return;
        session = new WatchTracker((body) => send("/watch/" + id, "PUT", body));
        tracker.current = session;
      })
      .catch(() => {
        if (alive) tracker.current = null;
      });
    return () => {
      alive = false;
      void session?.finish();
      tracker.current = null;
    };
  }, [active, signedIn, item.id, item.kind, send]);
  return (
    <article
      className="feed-card"
      data-video-id={item.id}
      aria-label={item.title}
    >
      <FeedPlayer
        id={item.id}
        active={active && !panel}
        preload={preload}
        saver={saver}
        initialPosition={initialPosition}
        onSample={(seconds, playing) => {
          if (active) {
            if (seconds < 0.5 && previous.current > item.duration - 0.75) {
              tracker.current?.sample(item.duration, false);
              tracker.current?.emit("complete");
              tracker.current?.sample(0, false);
              tracker.current?.emit("replay");
            }
            previous.current = seconds;
            position.current = seconds;
            tracker.current?.sample(seconds, playing);
          }
        }}
        onEvent={(event) => {
          if (active) tracker.current?.emit(event);
        }}
      />
      <div className="feed-caption">
        <a href={"/profil/" + item.creator.username} className="feed-creator">
          @{item.creator.username}
        </a>
        <h2>{item.title}</h2>
        <p>{item.description}</p>
        <div className="feed-tags">
          {item.hashtags.map((tag) => (
            <a
              key={tag}
              href={"/?tag=" + encodeURIComponent(tag) + "&kind=" + item.kind}
            >
              #{tag}
            </a>
          ))}
        </div>
        <div className="feed-tags">
          {Array.from(
            new Set(
              Array.from(
                item.description.matchAll(/@([a-zA-Z0-9_]{3,30})/g),
                (m) => m[1],
              ),
            ),
          )
            .slice(0, 10)
            .map((name) => (
              <a key={name} href={"/profil/" + name}>
                @{name}
              </a>
            ))}
        </div>
        <button onClick={() => setAudio((v) => !v)} aria-expanded={audio}>
          ♫ {item.audio.label} · @{item.audio.creator}
        </button>
        {audio && (
          <p>
            Audio de cette vidéo, attribué à @{item.audio.creator}.{" "}
            <a href={"/?creator=" + item.creator.username}>Voir le créateur</a>
          </p>
        )}
      </div>
      {active && (
        <SocialActions
          item={item}
          send={send}
          removed={removed}
          panelChanged={setPanel}
        />
      )}
    </article>
  );
}
