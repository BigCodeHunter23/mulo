/**
 * Crawlers MULO doesn't want. Each page costs database time, and in October a
 * flood of signed-out page loads used up the database's whole monthly allowance
 * and took the site down. These give nothing back for it.
 *
 * Search engines (Googlebot, bingbot, DuckDuckBot, Applebot) and link previews
 * (facebookexternalhit, Twitterbot, Slackbot, WhatsApp, Discordbot) are left out
 * on purpose: they're how people find an album and share it.
 */

/** Crawlers gathering pages for AI models and AI search. */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
  "PerplexityBot",
  "Amazonbot",
  "meta-externalagent",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "Timpibot",
  "ImagesiftBot",
  "omgili",
  "PetalBot",
  "AI2Bot",
  "YouBot",
];

/** Crawlers gathering pages to sell data about them. */
const DATA_CRAWLERS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "DataForSeoBot", "BLEXBot"];

/**
 * Names that only mean something in robots.txt. Google and Apple crawl with
 * their search crawlers and read these to know a page isn't for their AI, so
 * they never turn up on a request.
 */
const ROBOTS_ONLY = ["Google-Extended", "Applebot-Extended"];

const BLOCKED = [...AI_CRAWLERS, ...DATA_CRAWLERS].map((name) => name.toLowerCase());

/** Every crawler robots.txt asks to stay out. */
export const CRAWLERS_NOT_WANTED = [...AI_CRAWLERS, ...DATA_CRAWLERS, ...ROBOTS_ONLY];

/** Whether a request's User-Agent is a crawler to turn away at the door. */
export function isBlockedCrawler(agent: string | null): boolean {
  if (!agent) return false;
  const lower = agent.toLowerCase();
  return BLOCKED.some((name) => lower.includes(name));
}
