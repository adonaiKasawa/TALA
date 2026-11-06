import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedItem, Send } from './api';
import { useFeedback } from '../components/Toast';
export type SocialSummary = {
  liked: boolean;
  likes: number;
  saved: boolean;
  following: boolean;
  followRequested?: boolean;
  own: boolean;
};
export function useVideoSocial(item: FeedItem, send: Send, active: boolean) {
  const [summary, setSummary] = useState<SocialSummary | null>(null);
  const [notice, setNotice, dismissNotice] = useFeedback();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    const value = await send<SocialSummary>(`/videos/${item.id}/social`);
    if (alive.current) setSummary(value);
    return value;
  }, [item.id, send]);
  useEffect(() => {
    if (!active) return;
    let current = true;
    send<SocialSummary>(`/videos/${item.id}/social`)
      .then(value => {
        if (current) setSummary(value);
      })
      .catch(error => {
        if (current) setNotice(error.message);
      });
    return () => {
      current = false;
    };
  }, [active, item.id, send, setNotice]);
  const act = useCallback(
    async (work: () => Promise<unknown>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await work();
        await load();
        if (alive.current) setNotice('');
      } catch (error) {
        if (alive.current) setNotice((error as Error).message);
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [load, setNotice],
  );
  const like = useCallback(() => {
    if (summary?.liked) return;
    // A double tap is idempotent: it can never remove an existing like.
    return act(() => send(`/videos/${item.id}/reactions/like`, 'PUT'));
  }, [act, send, item.id, summary?.liked]);
  return { summary, notice, busy, act, like, setNotice, dismissNotice };
}
export type VideoSocial = ReturnType<typeof useVideoSocial>;
