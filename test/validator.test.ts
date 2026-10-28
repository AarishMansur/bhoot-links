import { describe, expect, it } from "vitest";
import { parseJsonLoose, validateVerdict, type EvidencePack } from "../src/ojha.js";

const pack: EvidencePack = {
  syllabus: "anchor: C tutorial\ncontext: Unit 1 Programming in C. Reference: learn-c-online",
  probe: "HTTP 200\nfinal domain: learn-c-online.in\npage text: Teen Patti Gold  welcome bonus 500%. Play casino now",
  render: "rendered title: Lucky Spin Casino\nvisible text: Claim your free spins today",
  wayback: "capture 20190312000000 at https://web.archive.org/web/20190312000000/http://learn-c-online.in/\narchived text: Learn C programming step by step",
  snapshotUrl: "https://web.archive.org/web/20190312000000/http://learn-c-online.in/",
};

const reply = (o: object) => "```json\n" + JSON.stringify(o) + "\n```";

describe("quote validator", () => {
  it("accepts verbatim quotes (whitespace and case insensitive)", () => {
    const v = validateVerdict(
      reply({
        status: "reincarnated",
        confidence: 0.9,
        evidence: [
          { quote: "teen patti gold welcome bonus", source: "probe" },
          { quote: "Learn C programming step by step", source: "wayback" },
        ],
        resurrection_url: pack.snapshotUrl,
        ojha_note_hinglish: "Domain pe casino ka bhoot hai, 2019 wali copy use karo.",
      }),
      pack,
    );
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("rejects a quote the model made up", () => {
    const v = validateVerdict(
      reply({ status: "possessed", confidence: 0.8, evidence: [{ quote: "Bet on IPL 2026 here", source: "render" }], resurrection_url: null, ojha_note_hinglish: "Satta!" }),
      pack,
    );
    expect(v.ok).toBe(false);
    expect(v.rejectedQuotes).toEqual(["Bet on IPL 2026 here"]);
  });

  it("rejects a quote attributed to the wrong source", () => {
    const v = validateVerdict(
      reply({ status: "possessed", confidence: 0.8, evidence: [{ quote: "Claim your free spins today", source: "probe" }], resurrection_url: null, ojha_note_hinglish: "x" }),
      pack,
    );
    expect(v.ok).toBe(false);
  });

  it("rejects invented resurrection urls", () => {
    const v = validateVerdict(
      reply({ status: "reincarnated", confidence: 0.8, evidence: [{ quote: "Play casino now", source: "probe" }], resurrection_url: "https://cprogramming.com", ojha_note_hinglish: "x" }),
      pack,
    );
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/resurrection_url/);
  });

  it("needs evidence for anything that is not alive", () => {
    const v = validateVerdict(reply({ status: "ghost", confidence: 0.5, evidence: [], resurrection_url: null, ojha_note_hinglish: "x" }), pack);
    expect(v.ok).toBe(false);
  });

  it("rejects non JSON replies and bad schema", () => {
    expect(validateVerdict("The link is possessed by spirits.", pack).ok).toBe(false);
    expect(validateVerdict(reply({ status: "haunted", confidence: 2 }), pack).ok).toBe(false);
  });

  it("parses JSON with chatter around it", () => {
    expect(parseJsonLoose('Sure! {"a": 1} hope this helps')).toEqual({ a: 1 });
  });
});
