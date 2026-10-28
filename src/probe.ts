import * as cheerio from "cheerio";
import { request } from "undici";

import { getConfig } from "./config.js";
import { hostOf, registrableDomain } from "./domain.js";
import { dnsStatus } from "./dns.js";
import { discard, dispatcher, readCapped, routeUrl } from "./http.js";
import { HostLimiter, pool } from "./ratelimit.js";
import { robotsAllows } from "./robots.js";
import { findSignals } from "./signals.js";
import type { Hop, ProbeResult } from "./types.js";

export function summarizeHtml(html: string) {
  const $ = cheerio.load(html);
  const scriptCount = $("script").length;
  const title = $("title").first().text().trim().slice(0, 200);
  const metaRefresh = $('meta[http-equiv="refresh" i]').attr("content") ?? "";
  $("script, style, noscript, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return { title, text, scriptCount, metaRefresh };
}

function errCode(e: any): string {
  const c = e?.code ?? e?.cause?.code ?? e?.name;
  if (c === "TimeoutError" || c === "AbortError" || c === "UND_ERR_ABORTED") return "TIMEOUT";
  return String(c ?? "UNKNOWN");
}

export async function probeOne(url: string, limiter: HostLimiter): Promise<ProbeResult> {
  const cfg = getConfig();
  const t0 = Date.now();
  const chain: Hop[] = [];
  const originalDomain = hostOf(url);
  const base = { url, chain, originalDomain, robotsBlocked: false, textSample: "", textLength: 0, scriptCount: 0, signals: [] as string[] };

  let current = url;
  try {
    if (!(await robotsAllows(url))) {
      return { ...base, ok: false, robotsBlocked: true, finalUrl: url, finalDomain: originalDomain, offDomain: false, ms: Date.now() - t0 };
    }
    if ((await dnsStatus(originalDomain)) === "nxdomain") {
      return { ...base, ok: false, errorCode: "ENOTFOUND", error: `${originalDomain} does not resolve`, finalUrl: url, finalDomain: originalDomain, offDomain: false, ms: Date.now() - t0 };
    }
    for (let hop = 0; hop <= cfg.maxRedirects; hop++) {
      await limiter.wait(hostOf(current));
      if (cfg.httpUpgrade && current.startsWith("http://") && !cfg.mock) {
        const upgraded = "https://" + current.slice(7);
        const ok = await request(upgraded, { method: "HEAD", dispatcher: dispatcher(), headers: { "user-agent": cfg.userAgent }, signal: AbortSignal.timeout(cfg.probeTimeoutMs) })
          .then((r) => (discard(r.body), true))
          .catch(() => false);
        if (ok) {
          chain.push({ url: current, status: 0 });
          current = upgraded;
        }
      }
      const res = await request(routeUrl(current), {
        method: "GET",
        dispatcher: dispatcher(),
        headers: { "user-agent": cfg.userAgent, accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(cfg.probeTimeoutMs),
      });
      chain.push({ url: current, status: res.statusCode });
      const loc = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
        discard(res.body);
        const next = new URL(Array.isArray(loc) ? loc[0] : loc, current);
        if (cfg.mock && next.hostname.endsWith(".bhoot.test")) next.port = "";
        current = next.toString();
        continue;
      }
      const ct = String(res.headers["content-type"] ?? "");
      const finalDomain = hostOf(current);
      const offDomain = registrableDomain(finalDomain) !== registrableDomain(originalDomain);
      let title: string | undefined;
      let text = "";
      let scriptCount = 0;
      if (/html|xml|text\/plain/i.test(ct) || !ct) {
        const body = await readCapped(res.body, 512 * 1024);
        const s = summarizeHtml(body);
        title = s.title;
        text = s.text;
        scriptCount = s.scriptCount;
        const refresh = s.metaRefresh.match(/url\s*=\s*['"]?([^'";]+)/i);
        if (refresh && hop < cfg.maxRedirects) {
          current = new URL(refresh[1], current).toString();
          continue;
        }
      } else {
        discard(res.body);
      }
      const signals = findSignals(`${title ?? ""} ${text}`);
      return {
        ...base,
        ok: res.statusCode >= 200 && res.statusCode < 400,
        status: res.statusCode,
        contentType: ct,
        finalUrl: current,
        finalDomain,
        offDomain,
        title,
        textSample: text.slice(0, 1500),
        textLength: text.length,
        scriptCount,
        signals,
        ms: Date.now() - t0,
      };
    }
    return { ...base, ok: false, errorCode: "TOO_MANY_REDIRECTS", error: "redirect loop", finalUrl: current, finalDomain: hostOf(current), offDomain: false, ms: Date.now() - t0 };
  } catch (e: any) {
    const finalDomain = hostOf(current);
    return {
      ...base,
      ok: false,
      errorCode: errCode(e),
      error: String(e?.cause?.message ?? e?.message ?? e).slice(0, 300),
      finalUrl: current,
      finalDomain,
      offDomain: registrableDomain(finalDomain) !== registrableDomain(originalDomain),
      ms: Date.now() - t0,
    };
  }
}

/** Interleave by host so the per-host delay does not stall the whole pool behind one slow college server. */
export function interleaveByHost<T extends { url: string }>(items: T[]): T[] {
  const byHost = new Map<string, T[]>();
  for (const it of items) {
    const h = hostOf(it.url);
    byHost.set(h, [...(byHost.get(h) ?? []), it]);
  }
  const queues = [...byHost.values()];
  const out: T[] = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!);
  return out;
}

export async function probeAll(urls: string[], onDone?: (r: ProbeResult) => void): Promise<Map<string, ProbeResult>> {
  const cfg = getConfig();
  const limiter = new HostLimiter(cfg.perHostDelayMs);
  const ordered = interleaveByHost(urls.map((url) => ({ url })));
  const results = new Map<string, ProbeResult>();
  await pool(ordered, cfg.probeConcurrency, async ({ url }) => {
    const r = await probeOne(url, limiter);
    results.set(url, r);
    onDone?.(r);
  });
  return results;
}
