import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots } from "../src/robots.js";

describe("robots.txt", () => {
  const txt = `User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: BadBot\nDisallow: /`;
  it("applies the * group with longest match", () => {
    const r = parseRobots(txt);
    expect(isAllowed(r, "/syllabus.pdf")).toBe(true);
    expect(isAllowed(r, "/private/notes")).toBe(false);
    expect(isAllowed(r, "/private/public/x")).toBe(true);
  });
  it("prefers a group naming us", () => {
    const r = parseRobots(`User-agent: *\nDisallow:\n\nUser-agent: bhoot-links\nDisallow: /`);
    expect(isAllowed(r, "/anything")).toBe(false);
  });
});
