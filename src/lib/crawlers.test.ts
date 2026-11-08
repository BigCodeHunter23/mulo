import { describe, expect, it } from "vitest";
import { isBlockedCrawler } from "./crawlers";

describe("isBlockedCrawler", () => {
  it.each([
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
    "CCBot/2.0 (https://commonscrawl.org/faq/)",
    "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
    "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "gptbot",
  ])("turns away %s", (agent) => {
    expect(isBlockedCrawler(agent)).toBe(true);
  });

  it.each([
    // Search engines are how people find an album.
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15 (Applebot/0.1)",
    "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)",
    // Link previews are what make a shared album look like one.
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "WhatsApp/2.23.20.0",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    // People, and the app.
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    "MULO/1 CFNetwork/1568 Darwin/24",
  ])("lets through %s", (agent) => {
    expect(isBlockedCrawler(agent)).toBe(false);
  });

  it("lets through a request that names nobody", () => {
    expect(isBlockedCrawler(null)).toBe(false);
    expect(isBlockedCrawler("")).toBe(false);
  });
});
