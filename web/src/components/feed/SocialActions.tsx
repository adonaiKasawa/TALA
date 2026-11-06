"use client";
import { Icon } from "@/components/Icon";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedItem, Send } from "./api";
type Summary = {
  likes: number;
  liked: boolean;
  saved: boolean;
  following: boolean;
  own: boolean;
  canInteract: boolean;
};
type Comment = {
  id: string;
  text: string;
  parentId: string | null;
  createdAt: string;
  author: { username: string; displayName: string };
  canDelete: boolean;
};
export function SocialActions({
  item,
  send,
  removed,
  panelChanged,
}: {
  item: FeedItem;
  send: Send;
  removed: () => void;
  panelChanged: (open: boolean) => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(false),
    [comments, setComments] = useState(false),
    [more, setMore] = useState(false);
  const load = useCallback(
    async () => setSummary(await send<Summary>(`/videos/${item.id}/social`)),
    [item.id, send],
  );
  useEffect(() => {
    let alive = true;
    send<Summary>(`/videos/${item.id}/social`)
      .then((r) => {
        if (alive) setSummary(r);
      })
      .catch((e) => {
        if (alive) setNotice(e.message);
      });
    return () => {
      alive = false;
    };
  }, [item.id, send]);
  async function act(work: () => Promise<unknown>) {
    if (pending) return;
    setPending(true);
    setNotice("");
    try {
      await work();
      await load();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function share() {
    const url = location.origin + "/regarder/" + item.id;
    if (navigator.share) await navigator.share({ title: item.title, url });
    else {
      await navigator.clipboard.writeText(url);
      setNotice("Lien copié.");
    }
  }
  return (
    <div className="social-actions">
      <button
        aria-pressed={summary?.liked || false}
        disabled={pending}
        onClick={() =>
          void act(() =>
            send(
              `/videos/${item.id}/reactions/like`,
              summary?.liked ? "DELETE" : "PUT",
            ),
          )
        }
      >
        <Icon name="heart" />
        <span>{summary?.likes || 0}</span>
        <span className="sr-only">J’aime</span>
      </button>
      <button
        aria-pressed={summary?.saved || false}
        disabled={pending}
        onClick={() =>
          void act(() =>
            send(
              `/videos/${item.id}/reactions/save`,
              summary?.saved ? "DELETE" : "PUT",
            ),
          )
        }
      >
        <Icon name="bookmark" />
        <span className="sr-only">
          {summary?.saved ? "Enregistrée" : "Enregistrer"}
        </span>
      </button>
      <button
        onClick={() => {
          setComments(true);
          panelChanged(true);
        }}
      >
        <Icon name="comment" />
        <span className="sr-only">Commentaires</span>
      </button>
      <button
        onClick={() =>
          void share().catch((e) => {
            if (e.name !== "AbortError")
              setNotice("Copie impossible. Utilisez le lien de lecture.");
          })
        }
      >
        <Icon name="share" />
        <span className="sr-only">Partager</span>
      </button>
      <button aria-expanded={more} onClick={() => setMore((v) => !v)}>
        <Icon name="more" />
        <span className="sr-only">Options</span>
      </button>
      {more && (
        <div className="feed-more">
          {!summary?.own && (
            <button
              aria-pressed={summary?.following || false}
              disabled={pending}
              onClick={() =>
                void act(() =>
                  send(
                    `/creators/${item.creator.username}/relations/follow`,
                    summary?.following ? "DELETE" : "PUT",
                  ),
                )
              }
            >
              <Icon name="plus" />
              <span>
                {summary?.following ? "Abonné" : "S’abonner"}
              </span>
            </button>
          )}

          <button
            onClick={() =>
              void act(async () => {
                await send(
                  `/videos/${item.id}/reactions/not_interested`,
                  "PUT",
                );
                removed();
              })
            }
          >
            Pas intéressé
          </button>
          {!summary?.own && (
            <>
              <button
                onClick={() =>
                  void act(async () => {
                    await send(
                      `/creators/${item.creator.username}/relations/mute`,
                      "PUT",
                    );
                    removed();
                  })
                }
              >
                Masquer ce créateur
              </button>
              <button
                onClick={() =>
                  void act(async () => {
                    if (
                      !confirm(
                        "Bloquer ce créateur et supprimer vos abonnements réciproques ?",
                      )
                    )
                      return;
                    await send(
                      `/creators/${item.creator.username}/relations/block`,
                      "PUT",
                    );
                    removed();
                  })
                }
              >
                Bloquer ce créateur
              </button>
              <button
                onClick={() =>
                  void act(async () => {
                    await send(
                      `/creators/${item.creator.username}/relations/restrict`,
                      "PUT",
                    );
                    setNotice(
                      "Ses commentaires sur vos vidéos seront visibles uniquement par leur auteur.",
                    );
                  })
                }
              >
                Restreindre ses commentaires
              </button>
            </>
          )}
          <a
            href={
              "https://wa.me/?text=" +
              encodeURIComponent(
                item.title +
                  " " +
                  (typeof location === "undefined" ? "" : location.origin) +
                  "/regarder/" +
                  item.id,
              )
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            Partager sur WhatsApp
          </a>
          <a href={"/regarder/" + item.id}>Lien de lecture</a>
        </div>
      )}
      {notice && (
        <p role="status" className="feed-notice">
          {notice}{" "}
          {!summary?.canInteract && <a href="/auth/login">Se connecter</a>}
        </p>
      )}
      {comments && (
        <Comments
          item={item}
          send={send}
          close={() => {
            setComments(false);
            panelChanged(false);
          }}
        />
      )}
    </div>
  );
}
function Comments({
  item,
  send,
  close,
}: {
  item: FeedItem;
  send: Send;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const [rows, setRows] = useState<Comment[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [text, setText] = useState(""),
    [reply, setReply] = useState<Comment | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async (after?: string) => {
      const page = await send<{ items: Comment[]; nextCursor: string | null }>(
        `/videos/${item.id}/comments${after ? "?cursor=" + encodeURIComponent(after) : ""}`,
      );
      setRows((old) => (after ? [...old, ...page.items] : page.items));
      setCursor(page.nextCursor);
    },
    [send, item.id],
  );
  useEffect(() => {
    let alive = true;
    send<{ items: Comment[]; nextCursor: string | null }>(
      `/videos/${item.id}/comments`,
    )
      .then((r) => {
        if (alive) {
          setRows(r.items);
          setCursor(r.nextCursor);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [item.id, send]);
  return (
    <dialog
      ref={dialog}
      className="feed-panel"
      aria-label="Commentaires"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2>Commentaires</h2>
        <button autoFocus onClick={close}>
          Fermer les commentaires
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!rows.length && <p>Aucun commentaire pour le moment.</p>}
      <ol>
        {rows.map((c) => (
          <li key={c.id} className={c.parentId ? "comment-reply" : ""}>
            <a href={"/?creator=" + c.author.username}>@{c.author.username}</a>
            {c.parentId && <small> · En réponse à un commentaire</small>}
            <p>{c.text}</p>
            {!c.parentId && (
              <button onClick={() => setReply(c)}>Répondre</button>
            )}
            {c.canDelete && (
              <button
                onClick={() => {
                  if (confirm("Supprimer ce commentaire et ses réponses ?"))
                    void send(`/videos/${item.id}/comments/${c.id}`, "DELETE")
                      .then(() => load())
                      .catch((e) => setError(e.message));
                }}
              >
                Supprimer le commentaire
              </button>
            )}
          </li>
        ))}
      </ol>
      {cursor && (
        <button
          onClick={() => void load(cursor).catch((e) => setError(e.message))}
        >
          Voir plus de commentaires
        </button>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            await send(`/videos/${item.id}/comments`, "POST", {
              text,
              ...(reply ? { parentId: reply.id } : {}),
            });
            setText("");
            setReply(null);
            await load();
            setError("");
          } catch (failure) {
            setError((failure as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {reply && (
          <p>
            Réponse à @{reply.author.username}{" "}
            <button type="button" onClick={() => setReply(null)}>
              Annuler la réponse
            </button>
          </p>
        )}
        <label>
          Votre commentaire
          <textarea
            required
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button disabled={busy}>Publier le commentaire</button>
      </form>
    </dialog>
  );
}
