import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { countsAsPageLoad, visitorAddress } from "./page-limit";

const at = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`https://mulo.test${path}`, init);

describe("countsAsPageLoad", () => {
  it.each(["/album/x", "/artist/x", "/u/sam", "/versus/2026-11-01", "/charts", "/discover", "/"])(
    "counts %s",
    (path) => {
      expect(countsAsPageLoad(at(path))).toBe(true);
    },
  );

  it.each([
    "/login",
    "/auth/confirm",
    "/join/abc",
    "/terms",
    "/album/x/opengraph-image",
    "/artist/x/opengraph-image",
    "/api/search",
    "/icon",
  ])("doesn't count %s", (path) => {
    expect(countsAsPageLoad(at(path))).toBe(false);
  });

  it("doesn't count a form being sent", () => {
    expect(countsAsPageLoad(at("/album/x", { method: "POST" }))).toBe(false);
  });

  // Next strips its own `next-router-prefetch` header before the proxy runs.
  it("doesn't count a link the browser is getting ready, or browsing would use it up", () => {
    const prefetch = at("/album/x", { headers: { "sec-fetch-dest": "empty" } });
    expect(countsAsPageLoad(prefetch)).toBe(false);
  });

  it.each([
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "WhatsApp/2.23.20.0",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "LinkedInBot/1.0",
    "TelegramBot (like TwitterBot)",
  ])("doesn't count a link preview, which keeps a failure: %s", (agent) => {
    expect(countsAsPageLoad(at("/album/x", { headers: { "user-agent": agent } }))).toBe(false);
  });

  it("counts a search engine, which a 429 only slows, and scrapers love to claim to be", () => {
    const google = at("/album/x", { headers: { "user-agent": "Googlebot/2.1" } });
    expect(countsAsPageLoad(google)).toBe(true);
  });

  it("counts a page opened in a browser, and by a script that doesn't say", () => {
    const opened = at("/album/x", { headers: { "sec-fetch-dest": "document" } });
    expect(countsAsPageLoad(opened)).toBe(true);
    expect(countsAsPageLoad(at("/album/x"))).toBe(true);
  });
});

describe("visitorAddress", () => {
  it("takes the first forwarded address", () => {
    const request = at("/", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } });
    expect(visitorAddress(request)).toBe("203.0.113.9");
  });

  it("falls back to the real-ip header, then to nobody in particular", () => {
    expect(visitorAddress(at("/", { headers: { "x-real-ip": "203.0.113.7" } }))).toBe(
      "203.0.113.7",
    );
    expect(visitorAddress(at("/"))).toBeNull();
  });
});
