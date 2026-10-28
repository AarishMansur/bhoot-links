/**
 * Registrable domain without pulling in the full public suffix list.
 * Covers the second level suffixes that show up in Indian syllabi
 * (ac.in, edu.in, gov.in, nic.in, co.in...) plus the common global ones.
 */
const TWO_LEVEL = new Set([
  "ac.in", "edu.in", "gov.in", "nic.in", "co.in", "org.in", "net.in", "res.in", "ernet.in",
  "co.uk", "ac.uk", "org.uk", "gov.uk", "com.au", "edu.au", "co.jp", "ac.jp", "com.br", "co.nz",
  "github.io", "gitlab.io", "blogspot.com", "wordpress.com", "netlify.app", "vercel.app", "pages.dev",
  "sites.google.com",
]);

export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h === "localhost") return h;
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  const last2 = parts.slice(-2).join(".");
  const last3 = parts.slice(-3).join(".");
  if (TWO_LEVEL.has(last3)) return parts.slice(-4).join(".");
  if (TWO_LEVEL.has(last2)) return last3;
  return last2;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Known parking / domain marketplace hosts. A redirect into one of these is a takeover smell. */
export const PARKING_HOSTS = [
  "sedoparking.com", "sedo.com", "bodis.com", "parkingcrew.net", "dan.com", "afternic.com",
  "hugedomains.com", "godaddy.com", "uniregistry.com", "above.com", "parklogic.com", "domainmarket.com",
  "undeveloped.com", "porkbun.com", "namecheap.com", "buydomains.com", "atom.com", "squadhelp.com",
];
