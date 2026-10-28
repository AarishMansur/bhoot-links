import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { getConfig } from "./config.js";
import { createMetrics, flushTracing, initTracing, printSummary, span } from "./metrics.js";
import { buildPack, judge, llmAvailable, rulesVerdict } from "./ojha.js";
import { writeOutputs } from "./output.js";
import { probeAll } from "./probe.js";
import { makeRenderer } from "./render.js";
import { loadSource } from "./source.js";
import { triage } from "./triage.js";
import type { LinkResult, RenderResult, ScanOutput, WaybackResult } from "./types.js";
import { findResurrection } from "./wayback.js";

export interface ScanOptions {
  limit?: number;
  render?: boolean;
  wayback?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ICON: Record<string, string> = { alive: "🌿", dead: "🪦", suspicious: "👁 ", blocked: "🚪" };

export async function scan(src: string, opts: ScanOptions = {}): Promise<ScanOutput> {
  const cfg = getConfig();
  const t0 = Date.now();
  const metrics = createMetrics();
  await initTracing(cfg.sentryDsn);
  const outDir = cfg.outDir;
  rmSync(join(outDir, "shots"), { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  return span("invoke_agent bhoot-ojha", "gen_ai.invoke_agent", { "gen_ai.agent.name": "bhoot-ojha", "bhoot.source": src }, async () => {
    console.log(`\n👻 bhoot scan ${src}${cfg.mock ? "  (MOCK mode)" : ""}`);
    const loaded = await loadSource(src);
    let links = loaded.links;
    if (opts.limit && links.length > opts.limit) links = links.slice(0, opts.limit);
    console.log(`  found ${loaded.links.length} links in ${loaded.sourceType}${loaded.pages ? ` (${loaded.pages} pages)` : ""}${links.length < loaded.links.length ? `, checking first ${links.length}` : ""}`);
    metrics.links = links.length;

    // 1. probe everything, politely
    const probes = await span("probe links", "gen_ai.execute_tool", { "gen_ai.tool.name": "http_probe", "bhoot.links": links.length }, () =>
      probeAll(
        links.map((l) => l.url),
        (p) => {
          const b = triage(p).bucket;
          console.log(`  ${ICON[b]} ${b.padEnd(10)} ${p.robotsBlocked ? "robots.txt" : p.status ?? p.errorCode ?? ""} ${p.url}`);
        },
      ),
    );

    // 2. triage
    const rows = links.map((l) => {
      const probe = probes.get(l.url)!;
      metrics.probeMsTotal += probe.ms;
      const tri = triage(probe);
      metrics.buckets[tri.bucket]++;
      return { link: l, probe, tri, render: undefined as RenderResult | undefined, wayback: undefined as WaybackResult | undefined };
    });

    // 3. render only what looks suspicious (a real browser is the expensive bit)
    const renderer = opts.render === false ? undefined : makeRenderer(cfg, outDir, metrics);
    const suspicious = rows.filter((r) => r.tri.bucket === "suspicious");
    if (renderer && suspicious.length) {
      console.log(`\n  rendering ${suspicious.length} suspicious link(s) with ${cfg.browserProvider}...`);
      for (const r of suspicious) {
        r.render = await span(`render ${r.link.url}`, "gen_ai.execute_tool", { "gen_ai.tool.name": "stagehand_extract", "bhoot.provider": cfg.browserProvider }, () =>
          renderer.render(r.link.url, r.link.id),
        );
        if (r.render) console.log(`    ${r.render.error ? "x" : r.render.gambling || r.render.casino || r.render.parked ? "😈" : "·"} ${r.link.url}${r.render.error ? "  " + r.render.error.slice(0, 80) : ""}`);
      }
      await renderer.close();
    }

    // 4. look for an older, clean soul on the Wayback Machine
    if (opts.wayback !== false && cfg.waybackEnabled) {
      // an archived YouTube watch page does not play the video, so it is no resurrection
      const needs = rows.filter((r) => (r.tri.bucket === "dead" || r.tri.bucket === "suspicious") && !r.probe.oembed);
      if (needs.length) console.log(`\n  searching the Wayback Machine for ${needs.length} link(s)...`);
      for (const r of needs) {
        r.wayback = await span(`wayback ${r.link.url}`, "gen_ai.execute_tool", { "gen_ai.tool.name": "wayback_cdx" }, () => findResurrection(r.link.url, cfg, metrics));
        console.log(`    ${r.wayback.found ? "🌼 " + r.wayback.timestamp : "-  " + (r.wayback.error ?? "none")} ${r.link.url}`);
      }
    }

    // 5. the ojha decides
    const useLlm = llmAvailable(cfg);
    console.log(`\n  ojha: ${useLlm ? (cfg.mock ? `mock ${cfg.model} replies` : cfg.model) : "rules only (set GOOGLE_GENERATIVE_AI_API_KEY for Gemma)"}`);
    const minGap = Number(process.env.LLM_MIN_INTERVAL_MS ?? (cfg.mock ? 0 : 2500));
    const results: LinkResult[] = [];
    for (const r of rows) {
      const fallback = () => rulesVerdict(r.probe, r.tri, r.render, r.wayback);
      let verdict;
      if (r.tri.bucket === "alive" || r.tri.bucket === "blocked" || !useLlm) verdict = fallback();
      else {
        verdict = await judge(cfg, metrics, r.link, buildPack(r.link, r.probe, r.tri, r.render, r.wayback), fallback);
        if (minGap) await sleep(minGap);
      }
      metrics.counts[verdict.status]++;
      results.push({ ...r.link, probe: r.probe, triage: r.tri, render: r.render, wayback: r.wayback, verdict });
    }

    metrics.wallMs = Date.now() - t0;
    const out: ScanOutput = {
      meta: {
        tool: "bhoot-links",
        version: "0.1.0",
        source: src,
        sourceType: loaded.sourceType,
        scannedAt: new Date().toISOString(),
        mode: cfg.mock ? "mock" : "real",
        model: useLlm ? cfg.model : null,
        browserProvider: opts.render === false ? "off" : cfg.browserProvider,
        notes: [],
      },
      metrics,
      links: results,
    };
    if (!useLlm) out.meta.notes.push("Verdicts came from the deterministic rules, not Gemma (no GOOGLE_GENERATIVE_AI_API_KEY).");
    if (cfg.browserProvider !== "browserbase" && !cfg.mock && opts.render !== false) out.meta.notes.push(`Suspicious pages were rendered with ${cfg.browserProvider} Chrome, not Browserbase.`);
    writeOutputs(out, loaded.text, outDir);
    printSummary(metrics);
    console.log(`  wrote ${join(outDir, "results.json")} and ${join(outDir, "syllabus-exorcised.md")}`);
    await flushTracing();
    return out;
  });
}
