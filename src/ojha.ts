import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import type { Config } from "./config.js";
import type { Metrics } from "./metrics.js";
import { span } from "./metrics.js";
import type { Evidence, ExtractedLink, ProbeResult, RenderResult, Status, TriageResult, Verdict, WaybackResult } from "./types.js";

/** Everything the ojha is allowed to look at. Evidence quotes must come from one of these strings. */
export interface EvidencePack {
  syllabus: string;
  probe: string;
  render: string;
  wayback: string;
  snapshotUrl: string | null;
}

export function buildPack(link: ExtractedLink, probe: ProbeResult, tri: TriageResult, render?: RenderResult, wb?: WaybackResult): EvidencePack {
  const chain = probe.chain.map((h) => `${h.url} (${h.status || "upgraded to https"})`).join(" -> ");
  const probeText = [
    probe.errorCode ? `error: ${probe.errorCode} ${probe.error ?? ""}` : `HTTP ${probe.status}`,
    chain && `redirect chain: ${chain}`,
    `final domain: ${probe.finalDomain}${probe.offDomain ? " (different from the original domain " + probe.originalDomain + ")" : ""}`,
    probe.title && `title: ${probe.title}`,
    `triage: ${tri.reasons.join("; ")}`,
    probe.textSample && `page text: ${probe.textSample.slice(0, 900)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const renderText = render
    ? [
        `rendered title: ${render.title}`,
        render.topic && `topic: ${render.topic}`,
        `flags: gambling=${render.gambling} casino=${render.casino} parked=${render.parked}`,
        render.signals.length ? `signals: ${render.signals.join(", ")}` : "",
        `visible text: ${render.textSample.slice(0, 1200)}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  const wbText = wb?.found ? `capture ${wb.timestamp} at ${wb.snapshotUrl}\narchived text: ${wb.textSample?.slice(0, 900)}` : wb ? `no usable capture (${wb.error ?? "none"})` : "";
  return {
    syllabus: `anchor: ${link.anchorText || "(bare url)"}\ncontext: ${link.context}\nurl: ${link.url}`,
    probe: probeText,
    render: renderText,
    wayback: wbText,
    snapshotUrl: wb?.found ? wb.snapshotUrl ?? null : null,
  };
}

export function buildPrompt(pack: EvidencePack) {
  return `You are the "ojha" (exorcist) of Bhoot Links. A link printed in an Indian university syllabus was checked by tools. Decide what happened to it.

STATUSES
- alive: the page still serves the study material the syllabus meant.
- ghost: the link is dead (404, 410, DNS failure, timeout, server error) and no archived copy is offered.
- possessed: the domain or page now shows betting, casino, satta, a parked "domain for sale" page, spam, or redirects to such content.
- reincarnated: the link is dead or possessed AND the WAYBACK section has a usable capture. Then resurrection_url must be exactly that capture URL.
- unsure: the evidence does not support any of the above with confidence.

RULES
- Use ONLY the four sections below. Do not use outside knowledge about the domain.
- evidence: 1 to 3 items. Each quote must be copied character for character from the section named in "source" (max 120 chars). Never paraphrase inside a quote.
- resurrection_url: "${pack.snapshotUrl ?? "null"}" if status is reincarnated, otherwise null. Never invent URLs.
- ojha_note_hinglish: one or two short lines in friendly Hinglish (Roman script) for a student, like a desi exorcist would say. No slurs, no fear mongering.
- Reply with ONE JSON object and nothing else:
{"status": "...", "confidence": 0.0-1.0, "evidence": [{"quote": "...", "source": "syllabus|probe|render|wayback"}], "resurrection_url": null, "ojha_note_hinglish": "..."}

=== SYLLABUS ===
${pack.syllabus}

=== PROBE ===
${pack.probe}

=== RENDER ===
${pack.render || "(not rendered)"}

=== WAYBACK ===
${pack.wayback || "(not looked up)"}`;
}

const RawVerdict = z.object({
  status: z.enum(["alive", "ghost", "possessed", "reincarnated", "unsure"]),
  confidence: z.coerce.number().min(0).max(1),
  evidence: z.array(z.object({ quote: z.string(), source: z.enum(["syllabus", "probe", "render", "wayback"]) })).max(5),
  resurrection_url: z.string().nullable().optional(),
  ojha_note_hinglish: z.string().min(1).max(400),
});

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(body.slice(start, end + 1));
}

export interface Validation {
  ok: boolean;
  errors: string[];
  rejectedQuotes: string[];
  value?: z.infer<typeof RawVerdict>;
}

/**
 * The hallucination guard. A verdict only counts if every quote it cites
 * really appears in the evidence we gave the model, and it does not make up a URL.
 */
export function validateVerdict(raw: string, pack: EvidencePack): Validation {
  const errors: string[] = [];
  const rejectedQuotes: string[] = [];
  let parsed: unknown;
  try {
    parsed = parseJsonLoose(raw);
  } catch (e: any) {
    return { ok: false, errors: [`not valid JSON: ${e.message}`], rejectedQuotes };
  }
  const r = RawVerdict.safeParse(parsed);
  if (!r.success) return { ok: false, errors: [`schema: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`], rejectedQuotes };
  const v = r.data;
  for (const ev of v.evidence) {
    const hay = norm(pack[ev.source] ?? "");
    const needle = norm(ev.quote);
    if (needle.length < 4 || !hay.includes(needle)) {
      rejectedQuotes.push(ev.quote);
      errors.push(`quote not found verbatim in ${ev.source}: "${ev.quote.slice(0, 80)}"`);
    }
  }
  if (v.status !== "alive" && v.evidence.length === 0) errors.push("non-alive verdict needs at least one evidence quote");
  const url = v.resurrection_url ?? null;
  if (v.status === "reincarnated") {
    if (!pack.snapshotUrl) errors.push("reincarnated but there is no Wayback capture");
    else if (url !== pack.snapshotUrl) errors.push(`resurrection_url must be exactly ${pack.snapshotUrl}`);
  } else if (url && url !== "null") {
    errors.push("resurrection_url must be null unless status is reincarnated");
  }
  return { ok: errors.length === 0, errors, rejectedQuotes, value: v };
}

/* ---------------- deterministic fallback (no key) ---------------- */

export function rulesVerdict(probe: ProbeResult, tri: TriageResult, render?: RenderResult, wb?: WaybackResult): Verdict {
  const ev = (quote: string, source: Evidence["source"]): Evidence => ({ quote, source });
  const reason = tri.reasons[0] ?? "";
  const possessed = !!render && (render.gambling || render.casino || render.parked || render.signals.some((s) => s.startsWith("spam:")));
  const staticPossessed = tri.reasons.some((r) => /betting|parking|spam/.test(r));
  const base = { by: "rules" as const, attempts: 0 };
  if (tri.bucket === "alive") return { ...base, status: "alive", confidence: 0.9, evidence: [ev(`HTTP ${probe.status}`, "probe")], resurrection_url: null, ojha_note_hinglish: "Link zinda hai, tension mat lo. Padhai shuru karo." };
  if (tri.bucket === "blocked") return { ...base, status: "unsure", confidence: 0.3, evidence: [ev(reason, "probe")], resurrection_url: null, ojha_note_hinglish: "Darwaza band hai, andar jhaank nahi paaya. Ek baar khud browser mein khol ke dekho." };
  const isPossessed = possessed || staticPossessed;
  const dead = tri.bucket === "dead";
  if ((dead || isPossessed) && wb?.found && wb.snapshotUrl) {
    const yr = wb.timestamp?.slice(0, 4);
    return {
      ...base,
      status: "reincarnated",
      confidence: 0.7,
      evidence: [ev(reason, "probe"), ev(`capture ${wb.timestamp}`, "wayback")],
      resurrection_url: wb.snapshotUrl,
      ojha_note_hinglish: isPossessed
        ? `Is domain pe ab koi aur bhoot baitha hai, asli page ki ${yr} wali aatma Wayback pe mil gayi. Wahi use karo.`
        : `Asli page toh chal basa, par ${yr} ki copy Wayback pe zinda hai. Yeh wala link use karo.`,
    };
  }
  if (isPossessed) return { ...base, status: "possessed", confidence: 0.75, evidence: [ev(reason, "probe")], resurrection_url: null, ojha_note_hinglish: "Yahan ab padhai nahi, satta ya for-sale ka bhoot baitha hai. Students ko yahan mat bhejo." };
  if (dead) return { ...base, status: "ghost", confidence: 0.8, evidence: [ev(reason, "probe")], resurrection_url: null, ojha_note_hinglish: "Yeh link mar chuka hai aur archive mein bhi aatma nahi mili. Naya resource dhoondna padega." };
  return { ...base, status: "unsure", confidence: 0.4, evidence: [ev(reason, "probe")], resurrection_url: null, ojha_note_hinglish: "Kuch toh gadbad hai, par pakka nahi bol sakta. Ek baar khud khol ke dekho." };
}

/* ---------------- Gemma ---------------- */

type Ask = (prompt: string, attempt: number) => Promise<{ text: string; tokensIn: number; tokensOut: number; ms: number; model: string }>;

let mockReplies: Record<string, string[]> | undefined;

function makeAsk(cfg: Config, url: string): Ask {
  if (cfg.mock) {
    mockReplies ??= JSON.parse(readFileSync(join("fixtures", "mocks", "gemma.json"), "utf8"));
    const replies = mockReplies![url] ?? [];
    return async (prompt, attempt) => {
      const text = replies[Math.min(attempt, replies.length - 1)] ?? "";
      // rough token estimate so the demo metrics strip is not empty; real runs use the API's usage numbers
      return { text, tokensIn: Math.ceil(prompt.length / 4), tokensOut: Math.ceil(text.length / 4), ms: 0, model: `${cfg.model} (mock)` };
    };
  }
  return async (prompt) => {
    const { generateText } = await import("ai");
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const google = createGoogleGenerativeAI({ apiKey: cfg.googleKey });
    const tryModel = async (model: string) => {
      const t0 = Date.now();
      const r = await generateText({ model: google(model), prompt, temperature: 0.2, maxRetries: 2 });
      return { text: r.text, tokensIn: r.usage?.inputTokens ?? 0, tokensOut: r.usage?.outputTokens ?? 0, ms: Date.now() - t0, model };
    };
    try {
      return await tryModel(cfg.model);
    } catch (e) {
      if (!cfg.fallbackModel) throw e;
      console.warn(`  ${cfg.model} failed (${String((e as any)?.message ?? e).slice(0, 80)}), trying ${cfg.fallbackModel}`);
      return await tryModel(cfg.fallbackModel);
    }
  };
}

export function llmAvailable(cfg: Config) {
  return cfg.mock || !!cfg.googleKey;
}

export async function judge(
  cfg: Config,
  metrics: Metrics,
  link: ExtractedLink,
  pack: EvidencePack,
  fallback: () => Verdict,
): Promise<Verdict> {
  if (!llmAvailable(cfg)) return fallback();
  const ask = makeAsk(cfg, link.url);
  const by = cfg.mock ? ("mock-gemma" as const) : ("gemma" as const);
  let prompt = buildPrompt(pack);
  const rejected: string[] = [];
  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let reply;
    try {
      reply = await span(`chat ${cfg.model}`, "gen_ai.chat", { "gen_ai.request.model": cfg.model, "gen_ai.operation.name": "chat", "bhoot.link": link.url, "bhoot.attempt": attempt + 1 }, async (s) => {
        const r = await ask(prompt, attempt);
        s?.setAttribute?.("gen_ai.usage.input_tokens", r.tokensIn);
        s?.setAttribute?.("gen_ai.usage.output_tokens", r.tokensOut);
        s?.setAttribute?.("gen_ai.response.model", r.model);
        return r;
      });
    } catch (e: any) {
      console.warn(`  llm error for ${link.url}: ${String(e?.message ?? e).slice(0, 120)}`);
      return { ...fallback(), rejected: [`llm error: ${String(e?.message ?? e).slice(0, 120)}`] };
    }
    metrics.llmCalls++;
    if (attempt > 0) metrics.llmRetries++;
    metrics.tokensIn += reply.tokensIn;
    metrics.tokensOut += reply.tokensOut;
    if (reply.ms) metrics.llmLatencyMs.push(reply.ms);
    const v = validateVerdict(reply.text, pack);
    rejected.push(...v.rejectedQuotes);
    metrics.llmRejectedQuotes += v.rejectedQuotes.length;
    if (v.ok && v.value) {
      return {
        status: v.value.status as Status,
        confidence: v.value.confidence,
        evidence: v.value.evidence,
        resurrection_url: v.value.status === "reincarnated" ? pack.snapshotUrl : null,
        ojha_note_hinglish: v.value.ojha_note_hinglish,
        by,
        model: reply.model,
        attempts: attempt + 1,
        rejected: rejected.length ? rejected : undefined,
      };
    }
    lastErrors = v.errors;
    prompt = `${buildPrompt(pack)}\n\nYOUR PREVIOUS REPLY WAS REJECTED:\n- ${v.errors.join("\n- ")}\nFix these. Quotes must be copied exactly from the sections. Reply with the JSON object only.`;
  }
  return {
    status: "unsure",
    confidence: 0,
    evidence: [],
    resurrection_url: null,
    ojha_note_hinglish: "Ojha ki aankhein dhundhli ho gayi, saboot match nahi hua. Isko insaan se check karwao.",
    by,
    model: cfg.model,
    attempts: 2,
    rejected: [...rejected, ...lastErrors],
  };
}
