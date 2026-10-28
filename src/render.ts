import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import type { Config } from "./config.js";
import { routeUrl } from "./http.js";
import type { Metrics } from "./metrics.js";
import { findSignals, hasKind } from "./signals.js";
import type { RenderResult } from "./types.js";

/** What Stagehand's extract() pulls out of a rendered suspicious page. */
export const PageVerdictSchema = z.object({
  title: z.string().describe("the visible page title or main heading"),
  topic: z.string().describe("what this page is about, in 12 words or fewer"),
  language: z.string().describe("main language of the page text, e.g. English, Hindi, Hinglish"),
  is_gambling_or_betting: z.boolean().describe("true if the page promotes betting, satta, online games for money or similar"),
  is_casino: z.boolean().describe("true if the page promotes a casino, slots, teen patti, rummy or similar"),
  is_parked_or_for_sale: z.boolean().describe("true if the page is a parked domain, a 'domain for sale' page or a generic ad landing page"),
  evidence_lines: z.array(z.string()).max(3).describe("up to 3 short lines copied exactly from the page that justify the flags above"),
});

const INSTRUCTION =
  "This link was printed in a university syllabus as a study resource. Look at the page as a student would see it and fill the fields. " +
  "Only copy evidence lines that literally appear on the page.";

export interface Renderer {
  render(url: string, id: string): Promise<RenderResult | undefined>;
  close(): Promise<void>;
}

class MockRenderer implements Renderer {
  private table: Record<string, Partial<RenderResult> & { screenshotFixture?: string }>;
  constructor(private cfg: Config, private shotsDir: string, private metrics: Metrics) {
    this.table = JSON.parse(readFileSync(join("fixtures", "mocks", "render.json"), "utf8"));
  }
  async render(url: string, id: string): Promise<RenderResult | undefined> {
    const row = this.table[url];
    if (!row) return undefined;
    this.metrics.pagesRendered++;
    let screenshot: string | undefined;
    if (row.screenshotFixture && existsSync(join("fixtures", "screens", row.screenshotFixture))) {
      screenshot = `shots/${id}.png`;
      copyFileSync(join("fixtures", "screens", row.screenshotFixture), join(this.shotsDir, `${id}.png`));
    }
    const { screenshotFixture: _s, ...rest } = row;
    return {
      url,
      finalUrl: url,
      title: "",
      topic: "",
      language: "English",
      gambling: false,
      casino: false,
      parked: false,
      signals: [],
      textSample: "",
      ms: 0,
      ...rest,
      screenshot,
      extractedBy: "mock",
    };
  }
  async close() {}
}

class StagehandRenderer implements Renderer {
  private sh: any;
  private startedAt = 0;
  private sessions = 0;
  private dead = false;

  constructor(private cfg: Config, private shotsDir: string, private metrics: Metrics) {}

  private async open() {
    if (this.sessions >= this.cfg.maxBbSessions && this.cfg.browserProvider === "browserbase") {
      this.dead = true;
      return;
    }
    const { Stagehand } = await import("@browserbasehq/stagehand");
    const bb = this.cfg.browserProvider === "browserbase";
    this.sh = new Stagehand({
      env: bb ? "BROWSERBASE" : "LOCAL",
      verbose: 0,
      disablePino: true,
      ...(bb
        ? {
            apiKey: this.cfg.browserbaseApiKey,
            projectId: this.cfg.browserbaseProjectId,
            browserbaseSessionCreateParams: { projectId: this.cfg.browserbaseProjectId!, timeout: 600 },
          }
        : {
            localBrowserLaunchOptions: {
              headless: true,
              args: ["--no-sandbox"],
              ...(this.cfg.chromePath ? { executablePath: this.cfg.chromePath } : {}),
            },
          }),
      ...(this.cfg.googleKey ? { model: { modelName: `google/${this.cfg.model}`, apiKey: this.cfg.googleKey } } : {}),
    } as any);
    await this.sh.init();
    this.sessions++;
    this.metrics.browserSessions++;
    this.startedAt = Date.now();
    if (bb && this.sh.browserbaseSessionID) {
      console.log(`  browserbase session: https://www.browserbase.com/sessions/${this.sh.browserbaseSessionID}`);
      this.metrics.browserbaseSessionIds.push(this.sh.browserbaseSessionID);
    }
  }

  async render(url: string, id: string): Promise<RenderResult | undefined> {
    if (this.dead) return undefined;
    if (this.metrics.pagesRendered >= this.cfg.maxRenderPages) return undefined;
    if (!this.sh) await this.open();
    if (!this.sh) return undefined;
    const t0 = Date.now();
    try {
      const page = this.sh.context.pages()[0] ?? (await this.sh.context.newPage());
      await page.goto(routeUrl(url), { waitUntil: "load", timeoutMs: 25_000 });
      // parked pages and casino takeovers usually paint after a short JS delay
      await new Promise((r) => setTimeout(r, 2500));
      const text: string = await page.evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim());
      const title: string = (await page.title().catch(() => "")) || "";
      const shot = await page.screenshot({ type: "jpeg", quality: 60 });
      writeFileSync(join(this.shotsDir, `${id}.jpg`), shot);
      this.metrics.pagesRendered++;
      const signals = findSignals(`${title} ${text}`);
      const base: RenderResult = {
        url,
        finalUrl: page.url(),
        title,
        topic: "",
        language: "",
        gambling: hasKind(signals, "gambling"),
        casino: signals.some((s) => /casino|teen patti|rummy|slot|roulette|poker|jackpot/.test(s)),
        parked: hasKind(signals, "parked"),
        signals,
        textSample: text.slice(0, 2000),
        screenshot: `shots/${id}.jpg`,
        extractedBy: "heuristic",
        ms: 0,
      };
      if (this.cfg.googleKey) {
        try {
          const x = await this.sh.extract(INSTRUCTION, PageVerdictSchema, { page, timeout: 60_000 });
          Object.assign(base, {
            title: x.title || title,
            topic: x.topic,
            language: x.language,
            gambling: x.is_gambling_or_betting || base.gambling,
            casino: x.is_casino || base.casino,
            parked: x.is_parked_or_for_sale || base.parked,
            signals: [...signals, ...x.evidence_lines.map((l: string) => `page:${l}`)],
            extractedBy: "stagehand",
          });
        } catch (e: any) {
          base.error = `extract failed, kept heuristic signals: ${String(e?.message ?? e).slice(0, 160)}`;
        }
      }
      base.ms = Date.now() - t0;
      return base;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      // a crashed or expired session: close it and let the next link open a fresh one (within MAX_BB_SESSIONS)
      if (/session|target closed|disconnected|websocket/i.test(msg)) await this.closeSession();
      return {
        url, finalUrl: url, title: "", topic: "", language: "", gambling: false, casino: false, parked: false,
        signals: [], textSample: "", extractedBy: "heuristic", ms: Date.now() - t0, error: msg.slice(0, 300),
      };
    }
  }

  private async closeSession() {
    if (!this.sh) return;
    try {
      const m = await this.sh.metrics;
      this.metrics.tokensIn += m?.extractPromptTokens ?? 0;
      this.metrics.tokensOut += m?.extractCompletionTokens ?? 0;
    } catch {}
    await this.sh.close().catch(() => {});
    this.metrics.browserMinutes += (Date.now() - this.startedAt) / 60_000;
    this.sh = undefined;
  }

  async close() {
    await this.closeSession();
  }
}

export function makeRenderer(cfg: Config, outDir: string, metrics: Metrics): Renderer | undefined {
  const shotsDir = join(outDir, "shots");
  mkdirSync(shotsDir, { recursive: true });
  if (cfg.browserProvider === "off") return undefined;
  if (cfg.browserProvider === "mock") return new MockRenderer(cfg, shotsDir, metrics);
  if (cfg.browserProvider === "browserbase" && (!cfg.browserbaseApiKey || !cfg.browserbaseProjectId)) {
    console.warn("  BROWSER_PROVIDER=browserbase but BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID are missing, skipping render");
    return undefined;
  }
  return new StagehandRenderer(cfg, shotsDir, metrics);
}
