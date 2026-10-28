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

/** Links typed into plain text (what you get from most syllabus PDFs). */
export function extractFromText(text: string, page?: number): ExtractedLink[] {
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
    return { links: dedupe(links), pages: text.total, text: text.text };
  } finally {
    await parser.destroy();
  }
}
