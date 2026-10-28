import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readCapped } from "../src/http.js";

async function* chunks(...bufs: Buffer[]) {
  for (const b of bufs) yield b;
}

describe("readCapped", () => {
  it("inflates a gzip body, the way Wayback replays raw captures", async () => {
    const gz = gzipSync(Buffer.from("<title>nptelvideos.in</title> This domain may be for sale"));
    expect(await readCapped(chunks(gz), 1e6, "gzip")).toContain("may be for sale");
  });
  it("sniffs gzip even without the header", async () => {
    const gz = gzipSync(Buffer.from("hello lecture notes"));
    expect(await readCapped(chunks(gz), 1e6)).toBe("hello lecture notes");
  });
  it("passes plain text through", async () => {
    expect(await readCapped(chunks(Buffer.from("plain")), 1e6)).toBe("plain");
  });
});
