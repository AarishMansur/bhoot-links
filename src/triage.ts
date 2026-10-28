import { PARKING_HOSTS, registrableDomain } from "./domain.js";
import { hasKind } from "./signals.js";
import type { ProbeResult, TriageResult } from "./types.js";

const DNS_ERRORS = new Set(["ENOTFOUND", "EAI_AGAIN", "ENODATA"]);
const NET_DEAD = new Set(["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "ETIMEDOUT", "TIMEOUT"]);
const TLS_ERRORS = /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i;
/** Shorteners and identity redirects that are allowed to send you somewhere else. */
const BENIGN_REDIRECTORS = ["bit.ly", "tinyurl.com", "goo.gl", "t.co", "doi.org", "dx.doi.org", "youtu.be", "forms.gle", "drive.google.com", "docs.google.com"];

/**
 * Cheap first pass. Everything here is deterministic so the expensive steps
 * (a real browser, the LLM) only see the links that actually need judgement.
 */
export function triage(p: ProbeResult): TriageResult {
  const reasons: string[] = [];

  if (p.robotsBlocked) return { bucket: "blocked", reasons: ["robots.txt disallows this path, not fetched"] };

  if (p.errorCode) {
    if (DNS_ERRORS.has(p.errorCode)) return { bucket: "dead", reasons: [`DNS lookup failed (${p.errorCode}): the domain no longer resolves`] };
    if (NET_DEAD.has(p.errorCode)) return { bucket: "dead", reasons: [`no response (${p.errorCode})`] };
    if (TLS_ERRORS.test(p.errorCode)) return { bucket: "suspicious", reasons: [`TLS problem (${p.errorCode}): certificate does not match, often a lapsed domain`] };
    return { bucket: "dead", reasons: [`request failed (${p.errorCode})`] };
  }

  if (p.oembed) {
    const o = p.oembed;
    if (o.status === 200) return { bucket: "alive", reasons: [`YouTube video exists: "${o.title ?? "untitled"}"`] };
    if (o.status === 403) return { bucket: "alive", reasons: ["YouTube video exists (embedding disabled)"] };
    if (o.status === 401) return { bucket: "dead", reasons: ["YouTube oEmbed 401: the video is private now"] };
    if (o.status === 400 || o.status === 404) return { bucket: "dead", reasons: [`YouTube oEmbed ${o.status}: video removed or never existed`] };
    if (o.status === 429) return { bucket: "blocked", reasons: ["YouTube rate limited the check"] };
  }

  const status = p.status ?? 0;
  if (status === 404 || status === 410) return { bucket: "dead", reasons: [`HTTP ${status}`] };
  if (status >= 500) return { bucket: "dead", reasons: [`HTTP ${status} server error`] };
  if (status === 401 || status === 403 || status === 429) return { bucket: "blocked", reasons: [`HTTP ${status}: the site refused a bot, a human may still see it`] };
  if (status >= 400) return { bucket: "dead", reasons: [`HTTP ${status}`] };

  const finalReg = registrableDomain(p.finalDomain);
  if (PARKING_HOSTS.some((h) => finalReg === h || p.finalDomain.endsWith("." + h))) {
    reasons.push(`redirects to a domain parking / marketplace host (${p.finalDomain})`);
  }
  if (hasKind(p.signals, "gambling")) reasons.push("betting / casino words in the page");
  if (hasKind(p.signals, "parked")) reasons.push("domain-parking words in the page");
  if (hasKind(p.signals, "spam")) reasons.push("spam words in the page");
  const fromShortener = BENIGN_REDIRECTORS.includes(registrableDomain(p.originalDomain)) || BENIGN_REDIRECTORS.includes(p.originalDomain);
  if (p.offDomain && !fromShortener) reasons.push(`redirects off-domain: ${p.originalDomain} -> ${p.finalDomain}`);
  const html = !p.contentType || /html/i.test(p.contentType);
  if (html && p.textLength < 300 && p.scriptCount >= 1) {
    reasons.push(`almost no static text (${p.textLength} chars) but ${p.scriptCount} script tag(s): content only appears after JS`);
  }

  if (reasons.length) return { bucket: "suspicious", reasons };
  return { bucket: "alive", reasons: [`HTTP ${status}`] };
}
