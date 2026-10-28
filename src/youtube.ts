import { request } from "undici";
import { getConfig } from "./config.js";
import { discard, dispatcher, readCapped } from "./http.js";

/**
 * A deleted YouTube video still answers 200 with a full page of JS, so the
 * normal probe would call it alive. YouTube's public oEmbed endpoint is
 * keyless and tells the truth: 200 for a watchable video, 400/404 when the
 * video is gone, 401 when it was made private.
 */
export function youTubeOembedTarget(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  if (host === "youtu.be" && u.pathname.length > 1) return url;
  if (host !== "youtube.com") return null;
  if (u.pathname === "/watch" && u.searchParams.get("v")) return url;
  if (u.pathname === "/playlist" && u.searchParams.get("list")) return url;
  if (/^\/(shorts|embed|live)\/[\w-]{6,}/.test(u.pathname)) return url;
  return null;
}

export interface OembedResult {
  status: number;
  title?: string;
  author?: string;
}

export async function youTubeOembed(url: string): Promise<OembedResult> {
  const cfg = getConfig();
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  const res = await request(endpoint, {
    dispatcher: dispatcher(),
    headers: { "user-agent": cfg.userAgent },
    signal: AbortSignal.timeout(cfg.probeTimeoutMs),
  });
  if (res.statusCode !== 200) {
    discard(res.body);
    return { status: res.statusCode };
  }
  try {
    const j = JSON.parse(await readCapped(res.body, 64 * 1024));
    return { status: 200, title: j.title, author: j.author_name };
  } catch {
    return { status: 200 };
  }
}
