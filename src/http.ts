import { lookup as dnsLookup } from "node:dns";
import { Agent, request } from "undici";

import { getConfig } from "./config.js";

/**
 * In MOCK mode every *.bhoot.test host resolves to the local fixture server,
 * so the demo can fake a dozen different "domains" without touching real DNS.
 * Hosts ending in .invalid still go to real DNS and fail, which is the point.
 */
function mockLookup(hostname: string, options: any, cb: any) {
  if (hostname.endsWith(".bhoot.test")) {
    if (options?.all) return cb(null, [{ address: "127.0.0.1", family: 4 }]);
    return cb(null, "127.0.0.1", 4);
  }
  return dnsLookup(hostname, options, cb);
}

let agent: Agent | undefined;
export function dispatcher() {
  if (!agent) {
    const cfg = getConfig();
    agent = new Agent({
      connect: { timeout: cfg.probeTimeoutMs, ...(cfg.mock ? { lookup: mockLookup as any } : {}) },
      headersTimeout: cfg.probeTimeoutMs,
      bodyTimeout: cfg.probeTimeoutMs,
    });
  }
  return agent;
}

export function mockPort() {
  return Number(process.env.FIXTURE_PORT ?? 4747);
}

/** In mock mode, URLs like http://x.bhoot.test/ are served by the fixture server on FIXTURE_PORT. */
export function routeUrl(url: string): string {
  const cfg = getConfig();
  if (!cfg.mock) return url;
  const u = new URL(url);
  if (u.hostname.endsWith(".bhoot.test") && !u.port) u.port = String(mockPort());
  return u.toString();
}

export async function getText(url: string, opts: { timeoutMs?: number; maxBytes?: number; headers?: Record<string, string> } = {}) {
  const cfg = getConfig();
  const res = await request(routeUrl(url), {
    method: "GET",
    dispatcher: dispatcher(),
    headers: { "user-agent": cfg.userAgent, accept: "text/html,application/xhtml+xml,*/*;q=0.8", ...opts.headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? cfg.probeTimeoutMs),
  });
  const body = await readCapped(res.body, opts.maxBytes ?? 512 * 1024);
  return { status: res.statusCode, headers: res.headers, body };
}

export async function readCapped(body: AsyncIterable<Buffer> & { destroy?: () => void }, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    size += chunk.length;
    if (size >= maxBytes) {
      discard(body);
      break;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Throw away a response body without an unhandled 'error' event from undici. */
export function discard(body: any) {
  body?.on?.("error", () => {});
  body?.destroy?.();
}
