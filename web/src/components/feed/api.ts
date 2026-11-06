export type Creator = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
};
export type FeedItem = {
  id: string;
  title: string;
  description: string;
  kind: "short" | "long";
  duration: number;
  hashtags: string[];
  creator: Creator;
  audio: { label: string; creator: string };
};
export type FeedPage = { items: FeedItem[]; nextCursor: string | null };
export type FeedPlayback = {
  url: string;
  thumbnail: string;
  type: "hls" | "mp4";
  expiresIn: number;
  captions: { language: string; label: string; url: string }[];
};
export type Send = <T = unknown>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
export async function community<T>(
  path: string,
  method = "GET",
  body?: unknown,
  csrf = "",
): Promise<T> {
  const r = await fetch("/api/community" + path, {
    method,
    cache: "no-store",
    keepalive: path.startsWith("/watch/") && method === "PUT",
    headers: {
      ...(method !== "GET" ? { "x-csrf-token": csrf } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || "Le service est indisponible.");
  return data;
}
