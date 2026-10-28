import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractFromPdf } from "../src/extract.js";

describe("extractFromPdf", () => {
  it("finds typed URLs and clickable annotation links, with page numbers", async () => {
    const { links, pages } = await extractFromPdf(new Uint8Array(readFileSync("fixtures/mini-syllabus.pdf")));
    const urls = links.map((l) => l.url);
    expect(pages).toBe(1);
    expect(urls).toContain("https://nptel.ac.in/courses/106/102/106102064/");
    expect(urls).toContain("http://www.bookstreet.in/");
    const anchored = links.find((l) => l.url.includes("nptelvideos"));
    expect(anchored?.anchorText).toBe("NPTEL video lectures");
    expect(anchored?.page).toBe(1);
  });
});
