import { describe, expect, it } from "vitest";
import { cleanUrl, extractFromHtml, extractFromText } from "../src/extract.js";

describe("cleanUrl", () => {
  it("strips trailing punctuation from PDFs", () => {
    expect(cleanUrl("https://nptel.ac.in/courses/106105171).")).toBe("https://nptel.ac.in/courses/106105171");
    expect(cleanUrl("https://example.com/a,")).toBe("https://example.com/a");
  });
  it("keeps balanced parentheses (wikipedia style)", () => {
    expect(cleanUrl("https://en.wikipedia.org/wiki/Tree_(data_structure)")).toBe("https://en.wikipedia.org/wiki/Tree_(data_structure)");
  });
  it("adds a scheme to bare www links", () => {
    expect(cleanUrl("www.geeksforgeeks.org/dbms")).toBe("http://www.geeksforgeeks.org/dbms");
  });
  it("rejects non http links", () => {
    expect(cleanUrl("ftp://old.server/file")).toBeNull();
  });
});

describe("extractFromText", () => {
  it("finds links with context and dedupes", () => {
    const text = `Unit 3: Normalization. Reference: https://dbms-notes.example.in/normal-forms. Also see https://dbms-notes.example.in/normal-forms again.`;
    const links = extractFromText(text, 2);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://dbms-notes.example.in/normal-forms");
    expect(links[0].context).toContain("Normalization");
    expect(links[0].page).toBe(2);
  });
});

describe("extractFromHtml", () => {
  const html = `<html><body>
    <nav><a href="/">Home</a></nav>
    <ul>
      <li>Unit 1 Compiler Design: <a href="http://compiler-notes.example.com/lex">Lex tutorial</a></li>
      <li>Lab manual <a href="/files/lab.pdf">PDF</a></li>
      <li><a href="mailto:hod@college.ac.in">mail HOD</a></li>
    </ul>
    <p>Pasted link: https://www.cse.iitb.ac.in/~cs101/</p>
  </body></html>`;
  it("gets anchors, pasted links and in-site files but skips nav and mailto", () => {
    const links = extractFromHtml(html, "https://college.ac.in/cse/syllabus");
    const urls = links.map((l) => l.url);
    expect(urls).toContain("http://compiler-notes.example.com/lex");
    expect(urls).toContain("https://college.ac.in/files/lab.pdf");
    expect(urls).toContain("https://www.cse.iitb.ac.in/~cs101/");
    expect(urls).not.toContain("https://college.ac.in/");
    expect(urls.some((u) => u.startsWith("mailto"))).toBe(false);
    const lex = links.find((l) => l.url.includes("lex"))!;
    expect(lex.anchorText).toBe("Lex tutorial");
    expect(lex.context).toContain("Compiler Design");
  });
});

describe("youTubeOembedTarget", async () => {
  const { youTubeOembedTarget } = await import("../src/youtube.js");
  it("accepts watch, short and playlist links", () => {
    expect(youTubeOembedTarget("https://www.youtube.com/watch?v=3Xo6P_V-qns&t=201s")).toBeTruthy();
    expect(youTubeOembedTarget("https://youtu.be/abc123")).toBeTruthy();
    expect(youTubeOembedTarget("https://www.youtube.com/playlist?list=PL123")).toBeTruthy();
  });
  it("ignores channels and other sites", () => {
    expect(youTubeOembedTarget("https://www.youtube.com/@nptelhrd")).toBeNull();
    expect(youTubeOembedTarget("https://nptel.ac.in/courses/106105171")).toBeNull();
  });
});

describe("PDF line-wrap repair", () => {
  it("glues a URL that was wrapped after a hyphen", () => {
    const [l] = extractFromText("3. https://www.youtube.com/watch?v=783KAB-\n   tuE4&list=PLIemF3uozcAK\n4. next");
    expect(l.url).toBe("https://www.youtube.com/watch?v=783KAB-tuE4&list=PLIemF3uozcAK");
  });
  it("cuts the next word off a YouTube id", () => {
    const ls = extractFromText("https://www.youtube.com/watch?v=PqFKRqpHrjwFor loop: https://www.youtube.com/watch?v=0ZvaDa8eT5s");
    expect(ls.map((l) => l.url)).toContain("https://www.youtube.com/watch?v=PqFKRqpHrjw");
  });
});

describe("dropTruncated", async () => {
  const { dropTruncated } = await import("../src/extract.js");
  const mk = (url: string, page = 1) => ({ id: url, url, anchorText: "", context: "", page });
  it("drops a copy cut off mid-word when the whole link is on the same page", () => {
    const out = dropTruncated([mk("https://x.com/toc/lex_auth_0138_s"), mk("https://x.com/toc/lex_auth_0138_shared/overview")]);
    expect(out.map((l) => l.url)).toEqual(["https://x.com/toc/lex_auth_0138_shared/overview"]);
  });
  it("keeps a site root next to a deep link", () => {
    expect(dropTruncated([mk("https://nptel.ac.in/"), mk("https://nptel.ac.in/courses/1")])).toHaveLength(2);
  });
  it("keeps links on different pages", () => {
    expect(dropTruncated([mk("https://x.com/ab", 1), mk("https://x.com/abc", 2)])).toHaveLength(2);
  });
});
