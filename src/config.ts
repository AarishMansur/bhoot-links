import { readFileSync, existsSync } from "node:fs";

/** Tiny .env loader so we do not need dotenv. Real env vars win. */
export function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const [, k, raw] = m;
    const v = raw.replace(/^["']|["']$/g, "");
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export function getConfig() {
  const env = process.env;
  const mock = env.MOCK === "1" || env.MOCK === "true";
  return {
    mock,
    userAgent: env.BHOOT_USER_AGENT ?? "bhoot-links/0.1 (+https://github.com/AarishMansur/bhoot-links; syllabus link checker)",
    probeTimeoutMs: num(env.PROBE_TIMEOUT_MS, 10_000),
    perHostDelayMs: num(env.PER_HOST_DELAY_MS, 1_000),
    probeConcurrency: num(env.PROBE_CONCURRENCY, 6),
    /** try https:// first for http:// links (status 0 hop in the chain marks the upgrade) */
    httpUpgrade: env.HTTP_UPGRADE === "1",
    maxRedirects: num(env.MAX_REDIRECTS, 8),
    browserProvider: (env.BROWSER_PROVIDER ?? (mock ? "mock" : "local")) as "browserbase" | "local" | "mock" | "off",
    maxBbSessions: num(env.MAX_BB_SESSIONS, 1),
    maxRenderPages: num(env.MAX_RENDER_PAGES, 25),
    browserbaseApiKey: env.BROWSERBASE_API_KEY,
    browserbaseProjectId: env.BROWSERBASE_PROJECT_ID,
    chromePath: env.CHROME_PATH,
    googleKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    model: env.LLM_MODEL ?? "gemma-4-26b-a4b-it",
    fallbackModel: env.LLM_FALLBACK_MODEL,
    waybackEnabled: env.WAYBACK !== "0",
    waybackMaxChecks: num(env.WAYBACK_MAX_CHECKS, 4),
    sentryDsn: env.SENTRY_DSN,
    outDir: env.OUT_DIR ?? "out",
  };
}

export type Config = ReturnType<typeof getConfig>;
