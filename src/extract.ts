import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

import type { ExtractedLink } from "./types.js";

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'()\[\]{}|\\^`]+/gi;
const CONTEXT_CHARS = 120;

export function linkId(url: string) {
  return createHash("sha1").update(url).digest("hex").slice(0, 10);
}

/** Trim trailing punctuation that PDFs and Word exports love to glue onto URLs. */
export function cleanUrl(raw: string): string | null {
  let u = raw.trim().replace(/[\u200b\u00ad]/g, "");
  while (/[.,;:!?'"\u201d\u2019)\]>]$/.test(u)) {
    if (u.endsWith(")") && (u.match(/\(/g)?.length ?? 0) >= (u.match(/\)/g)?.length ?? 0)) break;
    u = u.slice(0, -1);
  }
  // "watch?v=PqFKRqpHrjwFor loop:" in a PDF: YouTube ids are 11 chars, the rest is the next word
  u = u.replace(/([?&]v=[\w-]{11})([A-Z][a-z]{1,12})$/, "$1");
  if (/^www\./i.test(u)) u = "http://" + u;
  try {
    const parsed = new URL(u);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function squash(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function contextAround(text: string, index: number, length: number) {
  const start = Math.max(0, index - CONTEXT_CHARS);
  const end = Math.min(text.length, index + length + CONTEXT_CHARS);
  return squash(text.slice(start, end));
}

function dedupe(links: ExtractedLink[]): ExtractedLink[] {
  const seen = new Map<string, ExtractedLink>();
  for (const l of links) {
    const prev = seen.get(l.url);
    if (!prev) seen.set(l.url, l);
    else if (!prev.anchorText && l.anchorText) prev.anchorText = l.anchorText;
  }
  return [...seen.values()];
}

/**
 * A URL wrapped mid-word in the PDF text ("..._s" + newline + "hared/overview")
 * shows up both truncated (from the text) and whole (from the link annotation).
 * Drop the truncated copy when a longer link on the same page continues it mid-token.
 */
export function dropTruncated(links: ExtractedLink[]): ExtractedLink[] {
  return links.filter(
    (a) =>
      !links.some(
        (b) => b !== a && b.page === a.page && b.url.length > a.url.length && b.url.startsWith(a.url) && !a.url.endsWith("/") && /[\w%-]/.test(b.url[a.url.length]),
      ),
  );
}

/** Links typed into plain text (what you get from most syllabus PDFs). */
export function extractFromText(raw: string, page?: number): ExtractedLink[] {
  const text = raw
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*/g, "\n")
    // PDF line wraps split long URLs right after a "-", "=", "&", "?" or "_"; glue them back
    .replace(/(https?:\/\/\S*[-=&?_])\n([\w\-&=?%.\/#~]+)/g, "$1$2");
  const out: ExtractedLink[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = cleanUrl(m[0]);
    if (!url) continue;
    out.push({ id: linkId(url), url, anchorText: "", context: contextAround(text, m.index ?? 0, m[0].length), page });
  }
  return dedupe(out);
}

/** Links on a college web page: anchors plus any URLs pasted as text. */
export function extractFromHtml(html: string, baseUrl?: string): ExtractedLink[] {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const out: ExtractedLink[] = [];
  const baseHost = baseUrl ? new URL(baseUrl).hostname : "";
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) return;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    const url = cleanUrl(abs);
    if (!url) return;
    const anchorText = squash($(el).text()).slice(0, 160);
    const block = $(el).closest("li, p, td, tr, dd, div");
    const context = squash((block.length ? block : $(el).parent()).text()).slice(0, CONTEXT_CHARS * 2 + 40);
    out.push({ id: linkId(url), url, anchorText, context });
  });
  const bodyText = $("body").text();
  for (const l of extractFromText(bodyText)) out.push(l);
  return dedupe(out).filter((l) => {
    // skip in-site navigation chrome when scanning a whole department page, keep anything that looks like a resource
    if (!baseHost) return true;
    const h = new URL(l.url).hostname;
    return h !== baseHost || /\.(pdf|docx?|pptx?|zip)$/i.test(new URL(l.url).pathname);
  });
}

export interface PdfExtract {
  links: ExtractedLink[];
  pages: number;
  text: string;
}

export async function extractFromPdf(data: Uint8Array): Promise<PdfExtract> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data });
  try {
    const text = await parser.getText();
    const links: ExtractedLink[] = [];
    for (const p of text.pages) links.push(...extractFromText(p.text, p.num));
    // Clickable link annotations: catches links whose visible text is "click here" or got wrapped across lines.
    try {
      const info: any = await parser.getInfo({ parsePageInfo: true });
      for (const page of info.pages ?? []) {
        for (const a of page.links ?? []) {
          const url = cleanUrl(a.url ?? "");
          if (!url) continue;
          const pageText = text.pages.find((p) => p.num === page.pageNumber)?.text ?? "";
          const anchor = squash(a.text ?? "");
          const idx = anchor ? pageText.indexOf(anchor) : -1;
          links.push({
            id: linkId(url),
            url,
            anchorText: anchor.slice(0, 160),
            context: idx >= 0 ? contextAround(pageText, idx, anchor.length) : anchor,
            page: page.pageNumber,
          });
        }
      }
    } catch {
      /* annotations are a bonus, plain text links are enough */
    }
    return { links: dropTruncated(dedupe(links)), pages: text.total, text: text.text };
  } finally {
    await parser.destroy();
  }
}

/** Plain text of an HTML page with each link's address kept next to its anchor, for the exorcised copy. */
export function htmlToTextWithLinks(html: string, baseUrl?: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  $("a[href]").each((_, el) => {
    try {
      const abs = new URL($(el).attr("href") ?? "", baseUrl).toString();
      if (/^https?:/.test(abs)) $(el).append(` [${abs.replace(/&/g, "&amp;").replace(/</g, "&lt;")}]`);
    } catch {}
  });
  $("br, p, li, h1, h2, h3, h4, tr, div").each((_, el) => {
    $(el).append("\n");
  });
  return $("body").text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
