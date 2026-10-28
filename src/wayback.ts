import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Config } from "./config.js";
import { getText } from "./http.js";
import type { Metrics } from "./metrics.js";
import { summarizeHtml } from "./probe.js";
import { HostLimiter } from "./ratelimit.js";
import { findSignals } from "./signals.js";
import type { WaybackResult } from "./types.js";

const limiter = new HostLimiter(1200);
let mockTable: Record<string, { timestamp: string; text: string } | null> | undefined;

async function archiveGet(url: string, cfg: Config) {
  let current = url;
  for (let i = 0; i < 4; i++) {
    await limiter.wait("web.archive.org");
    const r = await getText(current, { timeoutMs: Math.max(cfg.probeTimeoutMs, 20_000), maxBytes: 768 * 1024 });
    const loc = r.headers.location;
    if (r.status >= 300 && r.status < 400 && loc) {
      current = new URL(Array.isArray(loc) ? loc[0] : loc, current).toString();
      continue;
    }
    return r;
  }
  throw new Error("too many archive redirects");
}

/**
 * Find the newest Wayback Machine capture that still looks like the original resource:
 * HTTP 200, real text, and none of the betting / parking signals that the takeover added.
 * Uses the public CDX API, no key needed.
 */
export async function findResurrection(url: string, cfg: Config, metrics: Metrics): Promise<WaybackResult> {
  metrics.waybackLookups++;
  if (cfg.mock) {
    mockTable ??= JSON.parse(readFileSync(join("fixtures", "mocks", "wayback.json"), "utf8"));
    const row = mockTable![url];
    if (!row) return { found: false, checked: 1, error: "never archived" };
    metrics.waybackFound++;
    return { found: true, checked: 1, timestamp: row.timestamp, snapshotUrl: `https://web.archive.org/web/${row.timestamp}/${url}`, textSample: row.text };
  }
  try {
    const target = url.replace(/^https?:\/\//, "");
    const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(target)}&output=json&fl=timestamp,original,statuscode&filter=statuscode:200&collapse=digest&limit=-15`;
    await limiter.wait("web.archive.org");
    const r = await getText(cdx, { timeoutMs: 30_000, maxBytes: 256 * 1024 });
    if (r.status !== 200) return { found: false, checked: 0, error: `CDX HTTP ${r.status}` };
    const rows: string[][] = r.body.trim() ? JSON.parse(r.body) : [];
    const snaps = rows.slice(1).reverse(); // newest first
    let checked = 0;
    for (const [timestamp, original] of snaps) {
      if (checked >= cfg.waybackMaxChecks) break;
      checked++;
      const raw = `https://web.archive.org/web/${timestamp}id_/${original}`;
      try {
        const page = await archiveGet(raw, cfg);
        if (page.status !== 200) continue;
        const ct = String(page.headers["content-type"] ?? "");
        const isHtml = /html/i.test(ct);
        const s = isHtml ? summarizeHtml(page.body) : { title: "", text: "", scriptCount: 0 };
        if (isHtml && (s.text.length < 200 || findSignals(`${s.title} ${s.text}`).length)) continue;
        metrics.waybackFound++;
        return {
          found: true,
          checked,
          timestamp,
          snapshotUrl: `https://web.archive.org/web/${timestamp}/${original}`,
          textSample: isHtml ? `${s.title}. ${s.text}`.slice(0, 1500) : `(${ct || "binary"} file archived)`,
        };
      } catch {
        continue;
      }
    }
    return { found: false, checked, error: snaps.length ? "no clean capture in the newest snapshots" : "never archived" };
  } catch (e: any) {
    return { found: false, checked: 0, error: String(e?.message ?? e).slice(0, 200) };
  }
}
