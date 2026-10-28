import { promises as dns } from "node:dns";

import { getConfig } from "./config.js";
import { getText } from "./http.js";

const cache = new Map<string, Promise<"ok" | "nxdomain" | "unknown">>();

/**
 * Does the hostname still exist? Default uses the system resolver.
 * DNS_RESOLVER=doh asks Cloudflare DNS-over-HTTPS instead, which is useful on
 * networks (CI boxes, office proxies) where the local resolver answers for every name.
 */
export function dnsStatus(host: string): Promise<"ok" | "nxdomain" | "unknown"> {
  const cfg = getConfig();
  if (cfg.mock && host.endsWith(".bhoot.test")) return Promise.resolve("ok");
  let p = cache.get(host);
  if (p) return p;
  p = (async () => {
    if ((process.env.DNS_RESOLVER ?? "system") === "doh") {
      try {
        const r = await getText(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`, {
          headers: { accept: "application/dns-json" },
          timeoutMs: 8000,
        });
        const j = JSON.parse(r.body);
        if (j.Status === 3) return "nxdomain";
        if (j.Status === 0 && (j.Answer ?? []).length) return "ok";
        if (j.Status === 0) {
          const r6 = await getText(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=AAAA`, { headers: { accept: "application/dns-json" }, timeoutMs: 8000 });
          return (JSON.parse(r6.body).Answer ?? []).length ? "ok" : "nxdomain";
        }
        return "unknown";
      } catch {
        return "unknown";
      }
    }
    try {
      await dns.lookup(host);
      return "ok";
    } catch (e: any) {
      return e?.code === "ENOTFOUND" ? "nxdomain" : "unknown";
    }
  })();
  cache.set(host, p);
  return p;
}
