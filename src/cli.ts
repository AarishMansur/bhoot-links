import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { getConfig, loadDotEnv } from "./config.js";
import { scan } from "./pipeline.js";

const HELP = `bhoot-links, a ghost link exorcist for syllabi

usage:
  bhoot scan <syllabus.pdf | page.html | https://...>  [--limit N] [--no-render] [--no-wayback] [--out DIR]
  bhoot report [--out DIR]     build the haunted HTML report from DIR/results.json (default out/)
  bhoot demo                   offline demo: fake internet + mock Browserbase, Wayback and Gemma, no keys

env: see .env.example`;

function flag(args: string[], name: string) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

function bool(args: string[], name: string) {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

export function buildReport(outDir: string) {
  const results = resolve(outDir, "results.json");
  if (!existsSync(results)) throw new Error(`${results} not found, run bhoot scan first`);
  const dataDir = join("web", "static", "data");
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  if (existsSync(join(outDir, "shots"))) cpSync(join(outDir, "shots"), join(dataDir, "shots"), { recursive: true });
  console.log("  building report (SvelteKit static)...");
  const r = spawnSync("npm", ["run", "build", "--workspace", "web", "--silent"], {
    stdio: "inherit",
    env: { ...process.env, BHOOT_RESULTS: results },
  });
  if (r.status !== 0) throw new Error("report build failed");
  const dest = join(outDir, "report");
  rmSync(dest, { recursive: true, force: true });
  cpSync(join("web", "build"), dest, { recursive: true });
  console.log(`  report: ${join(dest, "index.html")}  (or: npm run preview)`);
}

async function main() {
  loadDotEnv();
  const args = process.argv.slice(2);
  const cmd = args.shift();
  const out = flag(args, "--out");
  if (out) process.env.OUT_DIR = out;

  if (cmd === "scan") {
    const limit = flag(args, "--limit");
    const noRender = bool(args, "--no-render");
    const noWayback = bool(args, "--no-wayback");
    const src = args[0];
    if (!src) throw new Error("scan needs a PDF, HTML file or URL");
    await scan(src, { limit: limit ? Number(limit) : undefined, render: !noRender, wayback: !noWayback });
    return;
  }
  if (cmd === "report") {
    buildReport(getConfig().outDir);
    return;
  }
  if (cmd === "demo") {
    process.env.MOCK = "1";
    process.env.BROWSER_PROVIDER ??= "mock";
    process.env.PROBE_TIMEOUT_MS ??= "2500";
    process.env.PER_HOST_DELAY_MS ??= "150";
    const { startFixtureServer } = await import("../fixtures/server.js");
    const server = await startFixtureServer();
    try {
      await scan("http://syllabus.bhoot.test/btech-cse-sem5.html");
    } finally {
      server.close();
      server.closeAllConnections?.();
    }
    if (!bool(args, "--no-report")) buildReport(getConfig().outDir);
    return;
  }
  console.log(HELP);
  if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\n  error: ${e?.message ?? e}`);
  process.exit(1);
});
