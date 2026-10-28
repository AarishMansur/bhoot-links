import type { LinkResult } from "../../../src/types";

export const shortUrl = (u: string, max = 64) => {
  const s = u.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};

export const waybackDate = (ts?: string) => {
  if (!ts || ts.length < 8) return "";
  const d = new Date(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

export function causeOfDeath(l: LinkResult): string {
  const p = l.probe;
  if (p.oembed?.status === 401) return "video made private";
  if (p.oembed) return "video removed";
  if (p.errorCode === "ENOTFOUND") return "domain vanished (DNS)";
  if (p.errorCode === "TIMEOUT") return "never answered (timeout)";
  if (p.errorCode) return p.errorCode.toLowerCase().replace(/_/g, " ");
  if (p.status === 404) return "404, not found";
  if (p.status === 410) return "410, gone forever";
  if (p.status && p.status >= 500) return `${p.status}, server down`;
  if (l.render?.parked || l.render?.gambling || l.render?.casino) return "taken over";
  return p.status ? `HTTP ${p.status}` : "unknown";
}

export const wasPossessed = (l: LinkResult) =>
  !!(l.render && (l.render.gambling || l.render.casino || l.render.parked)) || l.triage.reasons.some((r) => /betting|parking|spam/.test(r));

export const label = (l: LinkResult) => l.anchorText || shortUrl(l.url, 48);
