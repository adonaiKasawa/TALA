import { request } from '../services/session';
import { config } from '../config';
export type FeedItem = {
  id: string;
  title: string;
  description: string;
  kind: 'short' | 'long';
  duration: number;
  hashtags: string[];
  creator: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  audio: { label: string; creator: string };
};
export type FeedPage = { items: FeedItem[]; nextCursor: string | null };
export type Playback = {
  url: string;
  thumbnail: string;
  type: string;
  captions: { language: string; label: string; url: string }[];
};
export type Send = <T = unknown>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
export async function feedRequest<T>(
  signedIn: boolean,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  if (signedIn) return (await request(path, 'api', method, body)) as T;
  if (method !== 'GET') throw new Error('Connectez-vous pour continuer.');
  const r = await fetch(config().api + '/api/v1' + path, {
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Service indisponible.');
  return data;
}
// Correlation identifier only; authorization is always enforced by the API.
export function eventId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n % 4) + 8).toString(16);
  });
}
