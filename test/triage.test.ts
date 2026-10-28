import { describe, expect, it } from "vitest";
import { triage } from "../src/triage.js";
import type { ProbeResult } from "../src/types.js";

const base = (over: Partial<ProbeResult>): ProbeResult => ({
  url: "https://example.ac.in/a",
  ok: true,
  status: 200,
  chain: [],
  finalUrl: "https://example.ac.in/a",
  originalDomain: "example.ac.in",
  finalDomain: "example.ac.in",
  offDomain: false,
  robotsBlocked: false,
  contentType: "text/html",
  textSample: "Lecture notes",
  textLength: 4000,
  scriptCount: 2,
  signals: [],
  ms: 10,
  ...over,
});

describe("triage", () => {
  it("keeps a normal 200 page alive", () => {
    expect(triage(base({})).bucket).toBe("alive");
  });
  it("marks 404 and 410 dead", () => {
    expect(triage(base({ status: 404 })).bucket).toBe("dead");
    expect(triage(base({ status: 410 })).bucket).toBe("dead");
  });
  it("marks DNS failure dead with a reason", () => {
    const t = triage(base({ ok: false, status: undefined, errorCode: "ENOTFOUND" }));
    expect(t.bucket).toBe("dead");
    expect(t.reasons[0]).toMatch(/DNS/);
  });
  it("marks timeouts dead", () => {
    expect(triage(base({ ok: false, status: undefined, errorCode: "TIMEOUT" })).bucket).toBe("dead");
  });
  it("does not call a 403 dead", () => {
    expect(triage(base({ status: 403 })).bucket).toBe("blocked");
  });
  it("flags casino words as suspicious", () => {
    const t = triage(base({ signals: ["gambling:casino"] }));
    expect(t.bucket).toBe("suspicious");
  });
  it("flags off-domain redirects", () => {
    const t = triage(base({ offDomain: true, finalDomain: "lucky-spin.xyz" }));
    expect(t.bucket).toBe("suspicious");
    expect(t.reasons.join()).toMatch(/off-domain/);
  });
  it("does not flag shorteners that redirect off-domain", () => {
    expect(triage(base({ originalDomain: "bit.ly", offDomain: true, finalDomain: "nptel.ac.in" })).bucket).toBe("alive");
  });
  it("flags JS-only shells (parked pages often render client side)", () => {
    const t = triage(base({ textLength: 12, scriptCount: 3 }));
    expect(t.bucket).toBe("suspicious");
  });
  it("flags redirects into parking hosts", () => {
    const t = triage(base({ offDomain: true, finalDomain: "www.hugedomains.com" }));
    expect(t.reasons.join()).toMatch(/parking/);
  });
  it("respects robots.txt", () => {
    expect(triage(base({ robotsBlocked: true })).bucket).toBe("blocked");
  });
});
