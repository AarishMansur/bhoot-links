import type { Metrics } from "./types.js";
export type { Metrics };

export function createMetrics(): Metrics {
  return {
    links: 0,
    counts: { alive: 0, ghost: 0, possessed: 0, reincarnated: 0, unsure: 0 },
    buckets: { alive: 0, dead: 0, suspicious: 0, blocked: 0 },
    probeMsTotal: 0,
    llmCalls: 0,
    llmRetries: 0,
    llmRejectedQuotes: 0,
    tokensIn: 0,
    tokensOut: 0,
    llmLatencyMs: [],
    browserSessions: 0,
    browserbaseSessionIds: [],
    browserMinutes: 0,
    pagesRendered: 0,
    waybackLookups: 0,
    waybackFound: 0,
    wallMs: 0,
  };
}

export function percentile(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export function printSummary(m: Metrics) {
  const c = m.counts;
  console.log(
    `\n  ${m.links} links | alive ${c.alive} | ghost ${c.ghost} | possessed ${c.possessed} | reincarnated ${c.reincarnated} | unsure ${c.unsure}`,
  );
  console.log(
    `  llm calls ${m.llmCalls} (retries ${m.llmRetries}, quotes rejected ${m.llmRejectedQuotes}) | tokens ${m.tokensIn} in / ${m.tokensOut} out | p50 ${percentile(m.llmLatencyMs, 50)} ms`,
  );
  console.log(
    `  browser sessions ${m.browserSessions} | pages rendered ${m.pagesRendered} | browser minutes ${m.browserMinutes.toFixed(2)} | wayback ${m.waybackFound}/${m.waybackLookups} found | wall ${(m.wallMs / 1000).toFixed(1)} s\n`,
  );
}

/* ---------- optional Sentry agent tracing ---------- */

type SpanFn = <T>(name: string, op: string, attrs: Record<string, string | number | boolean>, fn: (span: any) => Promise<T>) => Promise<T>;

let sentry: any;
export async function initTracing(dsn?: string) {
  if (!dsn) return;
  try {
    sentry = await import("@sentry/node");
    sentry.init({ dsn, tracesSampleRate: 1.0, sendDefaultPii: false, release: "bhoot-links@0.1.0" });
    console.log("  sentry tracing on");
  } catch (e) {
    console.warn("  SENTRY_DSN set but @sentry/node failed to load, tracing off");
  }
}

/**
 * Wrap a step in a Sentry span using the OpenTelemetry gen_ai conventions
 * (gen_ai.invoke_agent for the whole scan, gen_ai.chat for each Gemma call,
 * gen_ai.execute_tool for browser renders and Wayback lookups). No-op without SENTRY_DSN.
 */
export const span: SpanFn = async (name, op, attrs, fn) => {
  if (!sentry) return fn(undefined);
  return sentry.startSpan({ name, op, attributes: attrs }, (s: any) => fn(s));
};

export async function flushTracing() {
  if (sentry) await sentry.flush(5000);
}
