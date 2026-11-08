import { describe, expect, it } from "vitest";
import robots from "./robots";

const rules = () => {
  const { rules } = robots();
  return Array.isArray(rules) ? rules : [rules];
};
const forAgent = (agent: string) => rules().find((rule) => [rule.userAgent].flat().includes(agent));

describe("robots.txt", () => {
  it.each(["GPTBot", "ClaudeBot", "CCBot", "Bytespider", "Google-Extended", "Applebot-Extended"])(
    "asks %s to stay out altogether",
    (agent) => {
      expect(forAgent(agent)?.disallow).toBe("/");
    },
  );

  it("leaves albums and artists open to search engines", () => {
    const everyone = forAgent("*");
    expect(everyone?.allow).toBe("/");
    expect(forAgent("Googlebot")).toBeUndefined();
    expect([everyone?.disallow].flat()).not.toContain("/album/");
    expect([everyone?.disallow].flat()).not.toContain("/artist/");
  });

  // GPTBot is OpenAI's training crawler; OAI-SearchBot alone decides ChatGPT's search answers.
  it.each(["OAI-SearchBot", "PerplexityBot"])("treats %s like any search engine", (agent) => {
    expect(forAgent(agent)).toBeUndefined();
  });

  it.each(["/api/", "/search", "/login", "/admin", "/auth/"])(
    "keeps everyone out of %s, which is no use in a search result",
    (path) => {
      expect([forAgent("*")?.disallow].flat()).toContain(path);
    },
  );

  it("asks everyone to go slowly", () => {
    expect(forAgent("*")?.crawlDelay).toBeGreaterThan(0);
  });
});
