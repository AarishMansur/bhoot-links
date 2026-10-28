import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ScanOutput } from "../../../src/types";

export function load() {
  const path = process.env.BHOOT_RESULTS ?? resolve("..", "out", "results.json");
  if (!existsSync(path)) return { scan: null as ScanOutput | null, path };
  const scan = JSON.parse(readFileSync(path, "utf8")) as ScanOutput;
  return { scan, path };
}
