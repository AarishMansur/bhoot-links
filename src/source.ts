import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { request } from "undici";

import { getConfig } from "./config.js";
import { extractFromHtml, extractFromPdf, extractFromText, htmlToTextWithLinks } from "./extract.js";
import { dispatcher, routeUrl } from "./http.js";
import type { ExtractedLink, ScanOutput } from "./types.js";

export interface LoadedSource {
  source: string;
  sourceType: ScanOutput["meta"]["sourceType"];
  links: ExtractedLink[];
  /** plain text of the syllabus, used to write syllabus-exorcised.md */
  text: string;
  pages?: number;
}

async function fetchBytes(url: string) {
  const cfg = getConfig();
  let current = url;
  for (let i = 0; i < 6; i++) {
    const res = await request(routeUrl(current), {
      dispatcher: dispatcher(),
      headers: { "user-agent": cfg.userAgent },
      signal: AbortSignal.timeout(Number(process.env.SOURCE_TIMEOUT_MS) || 60_000),
    });
    const loc = res.headers.location;
    if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
      await res.body.dump();
      current = new URL(Array.isArray(loc) ? loc[0] : loc, current).toString();
      continue;
    }
    if (res.statusCode >= 400) throw new Error(`could not download ${url}: HTTP ${res.statusCode}`);
    const buf = Buffer.from(await res.body.arrayBuffer());
    return { buf, contentType: String(res.headers["content-type"] ?? ""), finalUrl: current };
  }
  throw new Error("too many redirects downloading source");
}

const isPdf = (buf: Buffer) => buf.subarray(0, 5).toString() === "%PDF-";

export async function loadSource(src: string): Promise<LoadedSource> {
  if (/^https?:\/\//i.test(src)) {
    const { buf, contentType, finalUrl } = await fetchBytes(src);
    if (isPdf(buf) || /pdf/i.test(contentType)) {
      const r = await extractFromPdf(new Uint8Array(buf));
      return { source: src, sourceType: "pdf", links: r.links, text: r.text, pages: r.pages };
    }
    const html = buf.toString("utf8");
    if (/html/i.test(contentType) || /<html|<body|<a\s/i.test(html)) {
      const links = extractFromHtml(html, finalUrl);
      return { source: src, sourceType: "html", links, text: htmlToTextWithLinks(html, finalUrl) };
    }
    return { source: src, sourceType: "text", links: extractFromText(html), text: html };
  }
  const buf = readFileSync(src);
  if (isPdf(buf) || extname(src).toLowerCase() === ".pdf") {
    const r = await extractFromPdf(new Uint8Array(buf));
    return { source: src, sourceType: "pdf", links: r.links, text: r.text, pages: r.pages };
  }
  const s = buf.toString("utf8");
  if (/\.html?$/i.test(src)) {
    const links = extractFromHtml(s);
    return { source: src, sourceType: "html", links, text: htmlToTextWithLinks(s) };
  }
  return { source: src, sourceType: "text", links: extractFromText(s), text: s };
}
