/**
 * Keyword signals for "possessed" pages. Deliberately boring and inspectable:
 * the LLM gets these as hints, it does not get to invent new ones.
 * Hindi and Hinglish terms are included because Indian betting spam is often bilingual.
 */
const GAMBLING = [
  "casino", "betting", "sportsbook", "online bet", "bet now", "jackpot", "slot machine", "online slots", "slot gacor", "roulette",
  "poker", "teen patti", "andar bahar", "rummy", "satta", "matka", "aviator game", "1xbet", "parimatch",
  "lottery", "free spins", "welcome bonus", "deposit bonus", "सट्टा", "जुआ", "कैसीनो",
];
const PARKED = [
  "this domain is for sale", "domain is for sale", "buy this domain", "domain may be for sale",
  "this domain may be for sale", "make an offer on this domain", "parked free", "domain parking",
  "is parked", "related searches", "sedoparking", "parkingcrew", "bodis", "hugedomains", "afternic",
  "the domain owner", "inquire about this domain", "this web page is parked",
];
const SPAM = ["viagra", "cialis", "replica watches", "payday loan", "crypto giveaway", "escort"];

export function findSignals(text: string): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  const hit = (kind: string, words: string[]) => {
    for (const w of words) {
      const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
      if (re.test(t)) out.push(`${kind}:${w}`);
    }
  };
  hit("gambling", GAMBLING);
  hit("parked", PARKED);
  hit("spam", SPAM);
  return out;
}

export const hasKind = (signals: string[], kind: string) => signals.some((s) => s.startsWith(kind + ":"));
