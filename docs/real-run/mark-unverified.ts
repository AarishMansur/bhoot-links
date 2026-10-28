/**
 * The machine this real run was made on sits behind an egress proxy that
 * answers every plain http:// request with "500, Server: Pingora", and a few
 * hosts reset or timed out only from there. Those are not proof that a link
 * is dead, so this script moves them to "unsure" before the numbers are
 * published. The untouched tool output is kept as results.raw.json.
 *
 *   npx tsx docs/real-run/mark-unverified.ts out-real/results.json docs/real-run
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LinkResult, ScanOutput } from "../../src/types.ts";

const [src, dir] = process.argv.slice(2);
const scan: ScanOutput = JSON.parse(readFileSync(src, "utf8"));
copyFileSync(src, join(dir, "results.raw.json"));

const NETWORK = new Set(["ECONNRESET", "UND_ERR_CONNECT_TIMEOUT", "TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"]);
const why = (l: LinkResult): string | null => {
  const last = l.probe.chain.at(-1);
  if (last && last.url.startsWith("http://") && last.status === 500) return "plain http answered 500 by the build machine's proxy (https upgrade failed too)";
  if (l.probe.errorCode && NETWORK.has(l.probe.errorCode)) return `${l.probe.errorCode} from the build machine only`;
  return null;
};

const unverified: { url: string; reason: string; toolSaid: string }[] = [];
for (const l of scan.links) {
  const reason = why(l);
  if (!reason || l.verdict.status === "alive") continue;
  unverified.push({ url: l.url, reason, toolSaid: l.verdict.status });
  l.triage.reasons.unshift(`unverified: ${reason}`);
  l.verdict = {
    ...l.verdict,
    status: "unsure",
    confidence: 0.2,
    resurrection_url: null,
    evidence: [{ quote: l.triage.reasons[1] ?? reason, source: "probe" }],
    ojha_note_hinglish: "Mere build machine se yeh site theek se dikhi hi nahi. Normal internet se ek baar khud check karo.",
  };
}

const c = { alive: 0, ghost: 0, possessed: 0, reincarnated: 0, unsure: 0 };
for (const l of scan.links) c[l.verdict.status]++;
scan.metrics.counts = c;
scan.meta.notes.push(`${unverified.length} link(s) could not be verified from the build machine's network and were moved to unsure (see docs/real-run/README.md).`);
writeFileSync(join(dir, "results.json"), JSON.stringify(scan, null, 2));
writeFileSync(join(dir, "unverified.json"), JSON.stringify(unverified, null, 2));
console.log(c, unverified);
