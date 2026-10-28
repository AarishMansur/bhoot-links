import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { LinkResult, ScanOutput } from "./types.js";

const EMOJI = { alive: "🌿", ghost: "🪦", possessed: "😈", reincarnated: "🌼", unsure: "❔" } as const;

function row(l: LinkResult) {
  const v = l.verdict;
  const fix = v.resurrection_url ? `[archived copy](${v.resurrection_url})` : v.status === "alive" ? "keep" : v.status === "unsure" ? "check by hand" : "remove / replace";
  const bare = l.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const at = l.context.indexOf(bare.split("/")[0]);
  const around = at > 0 ? l.context.slice(Math.max(0, at - 70), at).trim() : l.context.slice(0, 70);
  const what = (l.anchorText || around).replace(/\|/g, "/").slice(0, 70);
  return `| ${EMOJI[v.status]} ${v.status} | ${l.url} | ${what} | ${fix} | ${v.ojha_note_hinglish.replace(/\|/g, "/")} |`;
}

/** The syllabus, with every dead or possessed link swapped for its resurrection (or struck out). */
export function exorcisedMarkdown(out: ScanOutput, text: string) {
  let body = text;
  // longest first so a URL that is a prefix of another does not get replaced inside it
  const sorted = [...out.links].sort((a, b) => b.url.length - a.url.length);
  const variants = (u: string) => {
    const bare = u.replace(/\/$/, "");
    return [...new Set([u, bare, bare.replace(/^https?:\/\//, ""), bare.replace(/^https?:\/\/www\./, "www.")])];
  };
  for (const l of sorted) {
    const v = l.verdict;
    if (v.status === "alive" || v.status === "unsure") continue;
    const replacement = v.resurrection_url ? `${v.resurrection_url} (was ${l.url}, ${v.status})` : `~~${l.url}~~ (${v.status}: ${v.ojha_note_hinglish})`;
    for (const form of variants(l.url)) {
      if (form.length > 10 && body.includes(form)) {
        body = body.split(form).join(`\u0000${l.id}\u0000`);
      }
    }
    body = body.split(`\u0000${l.id}\u0000`).join(replacement);
  }
  const c = out.metrics.counts;
  return `# Syllabus, exorcised

Source: ${out.meta.source}  
Scanned: ${out.meta.scannedAt} (${out.meta.mode} run)  
Links: ${out.metrics.links} total, ${c.alive} alive, ${c.ghost} ghost, ${c.possessed} possessed, ${c.reincarnated} reincarnated, ${c.unsure} unsure

## Link register

| verdict | link | what the syllabus says | fix | ojha says |
|---|---|---|---|---|
${out.links.map(row).join("\n")}

## Syllabus text with replacements

> Dead and possessed links below are replaced with their Wayback Machine copy when one was found, otherwise struck out.

\`\`\`text
${body.trim()}
\`\`\`
`;
}

export function writeOutputs(out: ScanOutput, text: string, outDir: string) {
  writeFileSync(join(outDir, "results.json"), JSON.stringify(out, null, 2));
  writeFileSync(join(outDir, "syllabus-exorcised.md"), exorcisedMarkdown(out, text));
}
