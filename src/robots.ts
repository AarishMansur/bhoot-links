import { getText } from "./http.js";

interface Rules {
  allow: string[];
  disallow: string[];
}

const cache = new Map<string, Promise<Rules>>();

/** Minimal robots.txt support: groups for our agent name or "*", longest match wins. */
export function parseRobots(txt: string, agentToken = "bhoot-links"): Rules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], allow: [], disallow: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" && val) cur.allow.push(val);
    if (key === "disallow" && val) cur.disallow.push(val);
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && agentToken.toLowerCase().includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return { allow: chosen.flatMap((g) => g.allow), disallow: chosen.flatMap((g) => g.disallow) };
}

function matches(rule: string, path: string) {
  const re = new RegExp("^" + rule.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*").replace(/\\\$$/, "$"));
  return re.test(path);
}

export function isAllowed(rules: Rules, path: string): boolean {
  let best = { len: -1, allow: true };
  for (const r of rules.allow) if (matches(r, path) && r.length > best.len) best = { len: r.length, allow: true };
  for (const r of rules.disallow) if (matches(r, path) && r.length > best.len) best = { len: r.length, allow: false };
  return best.allow;
}

export async function robotsAllows(url: string): Promise<boolean> {
  const u = new URL(url);
  let p = cache.get(u.origin);
  if (!p) {
    p = getText(`${u.origin}/robots.txt`, { timeoutMs: 5000, maxBytes: 128 * 1024 })
      .then((r) => (r.status >= 200 && r.status < 300 ? parseRobots(r.body) : { allow: [], disallow: [] }))
      .catch(() => ({ allow: [], disallow: [] }));
    cache.set(u.origin, p);
  }
  return isAllowed(await p, u.pathname + u.search);
}
