export type Bucket = "alive" | "dead" | "suspicious" | "blocked";
export type Status = "alive" | "ghost" | "possessed" | "reincarnated" | "unsure";

export interface ExtractedLink {
  id: string;
  url: string;
  anchorText: string;
  /** ~240 chars of syllabus text around the link, so the ojha knows what the link was for */
  context: string;
  page?: number;
}

export interface Hop {
  url: string;
  status: number;
}

export interface ProbeResult {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
  errorCode?: string;
  chain: Hop[];
  finalUrl: string;
  originalDomain: string;
  finalDomain: string;
  offDomain: boolean;
  robotsBlocked: boolean;
  contentType?: string;
  title?: string;
  textSample: string;
  textLength: number;
  scriptCount: number;
  signals: string[];
  ms: number;
}

export interface TriageResult {
  bucket: Bucket;
  reasons: string[];
}

export interface RenderResult {
  url: string;
  finalUrl: string;
  title: string;
  topic: string;
  language: string;
  gambling: boolean;
  casino: boolean;
  parked: boolean;
  signals: string[];
  textSample: string;
  screenshot?: string;
  extractedBy: "stagehand" | "heuristic" | "mock";
  ms: number;
  error?: string;
}

export interface WaybackResult {
  found: boolean;
  timestamp?: string;
  snapshotUrl?: string;
  textSample?: string;
  checked: number;
  error?: string;
}

export interface Evidence {
  quote: string;
  source: "syllabus" | "probe" | "render" | "wayback";
}

export interface Verdict {
  status: Status;
  confidence: number;
  evidence: Evidence[];
  resurrection_url: string | null;
  ojha_note_hinglish: string;
  by: "gemma" | "rules" | "mock-gemma";
  model?: string;
  attempts: number;
  rejected?: string[];
}

export interface LinkResult extends ExtractedLink {
  probe: ProbeResult;
  triage: TriageResult;
  render?: RenderResult;
  wayback?: WaybackResult;
  verdict: Verdict;
}

export interface Metrics {
  links: number;
  counts: Record<Status, number>;
  buckets: Record<Bucket, number>;
  probeMsTotal: number;
  llmCalls: number;
  llmRetries: number;
  llmRejectedQuotes: number;
  tokensIn: number;
  tokensOut: number;
  llmLatencyMs: number[];
  browserSessions: number;
  browserbaseSessionIds: string[];
  browserMinutes: number;
  pagesRendered: number;
  waybackLookups: number;
  waybackFound: number;
  wallMs: number;
}

export interface ScanOutput {
  meta: {
    tool: string;
    version: string;
    source: string;
    sourceType: "pdf" | "html" | "text";
    scannedAt: string;
    mode: "real" | "mock";
    model: string | null;
    browserProvider: string;
    notes: string[];
  };
  metrics: Metrics;
  links: LinkResult[];
}
